import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import {
  TimesheetDay,
  TimesheetPeriod,
  TimesheetPeriodStatus,
  Holiday,
  LeaveRequest,
} from '../types';
import { shiftService } from './shift.service';
import { punchService } from './punch.service';
import { calculateDay } from './timeCalculation.service';
import { hourBankService } from './hourBank.service';
import { employeeService } from './employee.service';
import { leaveService } from './leave.service';
import { organizationService } from './organization.service';
import {
  competenceForDate,
  eachDateInRange,
  normalizePeriodStartDay,
  periodBoundsForCompetence,
} from '../utils/payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../constants';

const mapPeriod = (r: any): TimesheetPeriod => ({
  id: r.id,
  organizationId: r.organization_id,
  year: r.year,
  month: r.month,
  startDate: r.start_date,
  endDate: r.end_date,
  status: r.status,
  approvedBy: r.approved_by || undefined,
  approvedAt: r.approved_at || undefined,
  notes: r.notes || undefined,
});

const mapDay = (r: any): TimesheetDay => ({
  id: r.id,
  organizationId: r.organization_id,
  periodId: r.period_id,
  employeeId: r.employee_id,
  workDate: r.work_date,
  shiftId: r.shift_id || undefined,
  expectedMinutes: r.expected_minutes,
  workedMinutes: r.worked_minutes,
  breakMinutes: r.break_minutes,
  lateMinutes: r.late_minutes,
  earlyOutMinutes: r.early_out_minutes,
  overtimeMinutes: r.overtime_minutes,
  nightMinutes: r.night_minutes,
  absenceMinutes: r.absence_minutes,
  status: r.status,
  leaveRequestId: r.leave_request_id || undefined,
  firstPunchAt: r.first_punch_at || undefined,
  lastPunchAt: r.last_punch_at || undefined,
  calcVersion: r.calc_version,
  manualAdjustment: r.manual_adjustment || undefined,
  employeeAck: !!r.employee_ack,
  managerAck: !!r.manager_ack,
  remarks: r.remarks || undefined,
});

async function resolvePeriodStartDay(): Promise<number> {
  try {
    const config = await organizationService.getConfig();
    return normalizePeriodStartDay(
      config?.ptrpPolicy?.periodStartDay ?? DEFAULT_PTRP_POLICY.periodStartDay
    );
  } catch {
    return normalizePeriodStartDay(DEFAULT_PTRP_POLICY.periodStartDay);
  }
}

export const timesheetService = {
  async getOrCreatePeriod(year: number, month: number): Promise<TimesheetPeriod> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const startDay = await resolvePeriodStartDay();
    const { startDate, endDate } = periodBoundsForCompetence(year, month, startDay);

    const { data: existing } = await supabase
      .from('timesheet_periods')
      .select('*')
      .eq('organization_id', orgId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();

    if (existing) {
      // Re-align OPEN periods if org cutoff changed (e.g. calendar → 26–25)
      if (
        existing.status === 'OPEN' &&
        (existing.start_date !== startDate || existing.end_date !== endDate)
      ) {
        const { data: updated, error: updErr } = await supabase
          .from('timesheet_periods')
          .update({
            start_date: startDate,
            end_date: endDate,
            updated: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();
        if (updErr) throw updErr;
        return mapPeriod(updated);
      }
      return mapPeriod(existing);
    }

    const { data, error } = await supabase
      .from('timesheet_periods')
      .insert({
        organization_id: orgId,
        year,
        month,
        start_date: startDate,
        end_date: endDate,
        status: 'OPEN',
      })
      .select()
      .single();
    if (error) throw error;
    return mapPeriod(data);
  },

  async listPeriods(): Promise<TimesheetPeriod[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];
    const { data, error } = await supabase
      .from('timesheet_periods')
      .select('*')
      .eq('organization_id', orgId)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(36);
    if (error) throw error;
    return (data ?? []).map(mapPeriod);
  },

  async setPeriodStatus(periodId: string, status: TimesheetPeriodStatus, approvedBy?: string): Promise<void> {
    const payload: any = { status, updated: new Date().toISOString() };
    if (status === 'APPROVED' || status === 'LOCKED') {
      payload.approved_by = approvedBy || null;
      payload.approved_at = new Date().toISOString();
    }
    const { error } = await supabase.from('timesheet_periods').update(payload).eq('id', periodId);
    if (error) throw error;
    apiClient.notify();
  },

  async listDays(periodId: string, employeeId?: string): Promise<TimesheetDay[]> {
    if (!isSupabaseConfigured()) return [];
    let q = supabase.from('timesheet_days').select('*').eq('period_id', periodId).order('work_date');
    if (employeeId) q = q.eq('employee_id', employeeId);
    const { data, error } = await q.limit(5000);
    if (error) throw error;
    return (data ?? []).map(mapDay);
  },

  async listDaysInRange(startDate: string, endDate: string): Promise<TimesheetDay[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    let q = supabase
      .from('timesheet_days')
      .select('*')
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date', { ascending: true })
      .limit(10000);
    if (orgId) q = q.eq('organization_id', orgId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapDay);
  },

  async recalculateDay(employeeId: string, date: string, period?: TimesheetPeriod): Promise<TimesheetDay> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const d = new Date(`${date}T12:00:00`);
    let p = period;
    if (!p) {
      const startDay = await resolvePeriodStartDay();
      const c = competenceForDate(d, startDay);
      p = await this.getOrCreatePeriod(c.year, c.month);
    }
    if (p.status === 'LOCKED') throw new Error('Period is locked');

    const employees = await employeeService.getEmployees();
    const emp = employees.find(e => e.id === employeeId || e.employeeId === employeeId);
    const punchKey = emp?.employeeId || employeeId;

    const [punches, shift, holidays, leaves] = await Promise.all([
      punchService.listPunches({ employeeId: punchKey, startDate: date, endDate: date }),
      shiftService.resolveShiftForEmployee(emp?.id || employeeId, emp?.shiftId, date),
      organizationService.getHolidays().catch(() => [] as Holiday[]),
      leaveService.getLeaves().catch(() => [] as LeaveRequest[]),
    ]);

    const isHoliday = holidays.some(h => h.date === date);
    const approvedLeave = leaves.find(
      l =>
        l.status === 'APPROVED' &&
        (l.employeeId === emp?.id || l.employeeId === punchKey || l.employeeId === employeeId) &&
        date >= l.startDate &&
        date <= l.endDate
    );

    const calc = calculateDay({
      date,
      punches,
      shift,
      isHoliday,
      onApprovedLeave: !!approvedLeave,
      leaveRequestId: approvedLeave?.id,
    });

    const row = {
      organization_id: orgId,
      period_id: p.id,
      employee_id: punchKey,
      work_date: date,
      shift_id: calc.shiftId || null,
      expected_minutes: calc.expectedMinutes,
      worked_minutes: calc.workedMinutes,
      break_minutes: calc.breakMinutes,
      late_minutes: calc.lateMinutes,
      early_out_minutes: calc.earlyOutMinutes,
      overtime_minutes: calc.overtimeMinutes,
      night_minutes: calc.nightMinutes,
      absence_minutes: calc.absenceMinutes,
      status: calc.status,
      leave_request_id: calc.leaveRequestId || null,
      first_punch_at: calc.firstPunchAt || null,
      last_punch_at: calc.lastPunchAt || null,
      calc_version: 1,
      updated: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('timesheet_days')
      .upsert(row, { onConflict: 'organization_id,employee_id,work_date' })
      .select()
      .single();
    if (error) throw error;

    const day = mapDay(data);

    // Link punches
    if (punches.length) {
      await supabase
        .from('punches')
        .update({ timesheet_day_id: day.id })
        .in(
          'id',
          punches.map(x => x.id)
        );
    }

    // Hour bank
    await hourBankService.clearAutoEntriesForDay(day.id);
    const toBank = shift?.overtimeToBank !== false;
    if (toBank && calc.overtimeMinutes > 0) {
      await hourBankService.addEntry({
        employeeId: punchKey,
        entryDate: date,
        minutesDelta: calc.overtimeMinutes,
        entryType: 'OT_CREDIT',
        timesheetDayId: day.id,
        periodId: p.id,
        notes: 'Auto OT credit',
      });
    }
    if (toBank && calc.absenceMinutes > 0 && calc.status === 'ABSENT') {
      await hourBankService.addEntry({
        employeeId: punchKey,
        entryDate: date,
        minutesDelta: -calc.absenceMinutes,
        entryType: 'ABSENCE_DEBIT',
        timesheetDayId: day.id,
        periodId: p.id,
        notes: 'Auto absence debit',
      });
    }

    apiClient.notify();
    return day;
  },

  async recalculatePeriod(year: number, month: number, employeeIds?: string[]): Promise<number> {
    const period = await this.getOrCreatePeriod(year, month);
    if (period.status === 'LOCKED') throw new Error('Period is locked');

    const employees = await employeeService.getEmployees();
    const targets = employeeIds?.length
      ? employees.filter(e => employeeIds.includes(e.id) || employeeIds.includes(e.employeeId || ''))
      : employees.filter(e => e.role !== 'SUPER_ADMIN');

    const dates = eachDateInRange(period.startDate, period.endDate);
    let count = 0;
    for (const emp of targets) {
      for (const date of dates) {
        await this.recalculateDay(emp.id, date, period);
        count++;
      }
    }
    return count;
  },

  async acknowledgeDay(dayId: string, who: 'employee' | 'manager'): Promise<void> {
    const payload = who === 'employee' ? { employee_ack: true } : { manager_ack: true };
    const { error } = await supabase.from('timesheet_days').update(payload).eq('id', dayId);
    if (error) throw error;
    apiClient.notify();
  },

  async applyManualAdjustment(
    dayId: string,
    adjustment: Record<string, unknown>,
    remarks?: string
  ): Promise<void> {
    const { data: existing, error: fetchErr } = await supabase
      .from('timesheet_days')
      .select('*')
      .eq('id', dayId)
      .single();
    if (fetchErr) throw fetchErr;

    const patch: any = {
      manual_adjustment: adjustment,
      status: 'ADJUSTED',
      remarks: remarks || existing.remarks,
      updated: new Date().toISOString(),
    };
    if (typeof adjustment.workedMinutes === 'number') patch.worked_minutes = adjustment.workedMinutes;
    if (typeof adjustment.overtimeMinutes === 'number') patch.overtime_minutes = adjustment.overtimeMinutes;
    if (typeof adjustment.lateMinutes === 'number') patch.late_minutes = adjustment.lateMinutes;
    if (typeof adjustment.absenceMinutes === 'number') patch.absence_minutes = adjustment.absenceMinutes;

    const { error } = await supabase.from('timesheet_days').update(patch).eq('id', dayId);
    if (error) throw error;
    apiClient.notify();
  },

  async exportPeriodCsv(periodId: string): Promise<string> {
    const days = await this.listDays(periodId);
    const headers = [
      'employee_id',
      'work_date',
      'status',
      'expected_min',
      'worked_min',
      'break_min',
      'late_min',
      'early_out_min',
      'overtime_min',
      'night_min',
      'absence_min',
    ];
    const lines = [headers.join(',')];
    for (const d of days) {
      lines.push(
        [
          d.employeeId,
          d.workDate,
          d.status,
          d.expectedMinutes,
          d.workedMinutes,
          d.breakMinutes,
          d.lateMinutes,
          d.earlyOutMinutes,
          d.overtimeMinutes,
          d.nightMinutes,
          d.absenceMinutes,
        ].join(',')
      );
    }
    return lines.join('\n');
  },

  async generateEsocialStub(periodId: string): Promise<{ id: string; payload: Record<string, unknown> }> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const days = await this.listDays(periodId);
    const payload = {
      eventType: 'S-1200-STUB',
      generatedAt: new Date().toISOString(),
      days: days.map(d => ({
        employeeId: d.employeeId,
        date: d.workDate,
        status: d.status,
        workedMinutes: d.workedMinutes,
        overtimeMinutes: d.overtimeMinutes,
        nightMinutes: d.nightMinutes,
        absenceMinutes: d.absenceMinutes,
      })),
    };

    const { data, error } = await supabase
      .from('esocial_events')
      .insert({
        organization_id: orgId,
        period_id: periodId,
        event_type: 'S-1200-STUB',
        payload,
        status: 'READY',
      })
      .select('id')
      .single();
    if (error) throw error;
    return { id: data.id, payload };
  },
};
