import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import {
  TimesheetDay,
  TimesheetPeriod,
  TimesheetPeriodStatus,
  TimesheetEmployeeReview,
  TimesheetEmployeeReviewStatus,
  Holiday,
  LeaveRequest,
  Employee,
} from '../types';
import { notificationService } from './notification.service';
import { validateTimesheetEmployeeReview } from '../utils/timesheetReviewValidation';
import { shiftService } from './shift.service';
import { punchService } from './punch.service';
import { calculateDay } from './timeCalculation.service';
import { hourBankService } from './hourBank.service';
import { employeeService } from './employee.service';
import { leaveService } from './leave.service';
import { organizationService } from './organization.service';
import { rosterService } from './roster.service';
import {
  competenceForDate,
  eachDateInRange,
  minIsoDate,
  normalizePeriodStartDay,
  periodBoundsForCompetence,
  todayIsoLocal,
} from '../utils/payrollPeriod';
import { isNonPunchingStaff } from '../utils/roles';
import { convertToWebP } from '../utils/imageConvert';
import { DEFAULT_PTRP_POLICY } from '../constants';

const TIMESHEET_SIGN_BUCKET = 'timesheet-signatures';

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

const mapReview = (r: any): TimesheetEmployeeReview => ({
  id: r.id,
  organizationId: r.organization_id,
  periodId: r.period_id,
  employeeId: r.employee_id,
  profileId: r.profile_id || undefined,
  status: r.status,
  submittedAt: r.submitted_at || undefined,
  submittedBy: r.submitted_by || undefined,
  approvedAt: r.approved_at || undefined,
  approvedBy: r.approved_by || undefined,
  employeeSignedAt: r.employee_signed_at || undefined,
  employeeSelfiePath: r.employee_selfie_path || undefined,
  employeeSignaturePath: r.employee_signature_path || undefined,
  employeeSignMetadata: r.employee_sign_metadata || undefined,
});

function resolveEmployeeRecord(employees: Employee[], employeeKey: string): Employee | undefined {
  return employees.find(
    e => e.id === employeeKey || e.employeeId === employeeKey
  );
}

function punchKeyForEmployee(emp: Employee | undefined, employeeKey: string): string {
  return emp?.employeeId || employeeKey;
}

function daysForEmployee(allDays: TimesheetDay[], emp: Employee | undefined, employeeKey: string): TimesheetDay[] {
  const punchKey = punchKeyForEmployee(emp, employeeKey);
  return allDays.filter(
    d =>
      d.employeeId === employeeKey ||
      d.employeeId === emp?.id ||
      d.employeeId === punchKey
  );
}

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

    const employeeKeys = [emp?.id, emp?.employeeId, employeeId, punchKey].filter(
      (k): k is string => !!k
    );

    const [punches, shift, holidays, leaves, rosterStatus] = await Promise.all([
      punchService.listPunches({ employeeId: punchKey, startDate: date, endDate: date }),
      shiftService.resolveShiftForEmployee(emp?.id || employeeId, emp?.shiftId, date),
      organizationService.getHolidays().catch(() => [] as Holiday[]),
      leaveService.getLeaves().catch(() => [] as LeaveRequest[]),
      rosterService.getStatusForEmployee(date, employeeKeys).catch(() => null),
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
      rosterStatus,
      joiningDate: emp?.joiningDate || undefined,
      terminationDate: emp?.terminationDate || undefined,
    });

    // Keep manual adjustments: recalculation must not wipe manager edits.
    const { data: existingDay } = await supabase
      .from('timesheet_days')
      .select('id, manual_adjustment, status, remarks, employee_ack, manager_ack')
      .eq('organization_id', orgId)
      .eq('employee_id', punchKey)
      .eq('work_date', date)
      .maybeSingle();

    const hasManual =
      existingDay?.manual_adjustment &&
      typeof existingDay.manual_adjustment === 'object' &&
      Object.keys(existingDay.manual_adjustment as object).length > 0;

    const row: Record<string, unknown> = {
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

    if (hasManual) {
      const adj = existingDay.manual_adjustment as Record<string, unknown>;
      row.manual_adjustment = adj;
      row.status = 'ADJUSTED';
      if (typeof adj.workedMinutes === 'number') row.worked_minutes = adj.workedMinutes;
      if (typeof adj.overtimeMinutes === 'number') row.overtime_minutes = adj.overtimeMinutes;
      if (typeof adj.lateMinutes === 'number') row.late_minutes = adj.lateMinutes;
      if (typeof adj.absenceMinutes === 'number') row.absence_minutes = adj.absenceMinutes;
      if (existingDay.remarks) row.remarks = existingDay.remarks;
      // Keep acknowledgements when preserving a manual edit.
      if (typeof existingDay.employee_ack === 'boolean') row.employee_ack = existingDay.employee_ack;
      if (typeof existingDay.manager_ack === 'boolean') row.manager_ack = existingDay.manager_ack;
    }

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

  async recalculatePeriod(
    year: number,
    month: number,
    employeeIds?: string[],
  ): Promise<{ count: number; failed: number; firstError?: string }> {
    const period = await this.getOrCreatePeriod(year, month);
    if (period.status === 'LOCKED') throw new Error('Period is locked');

    const employees = await employeeService.getEmployees();
    const targets = employeeIds?.length
      ? employees.filter(e => employeeIds.includes(e.id) || employeeIds.includes(e.employeeId || ''))
      : employees.filter(e => {
          if (isNonPunchingStaff(e.role) || e.role === 'SUPER_ADMIN') return false;
          // Hired after this competence ends — nothing to calculate
          if (e.joiningDate && e.joiningDate > period.endDate) return false;
          // Left before this competence starts — skip full-period sweep
          if (
            e.status === 'INACTIVE' &&
            e.terminationDate &&
            e.terminationDate < period.startDate
          ) {
            return false;
          }
          return true;
        });

    if (targets.length === 0) {
      throw new Error('No employees to recalculate');
    }

    const today = todayIsoLocal();
    const endCap = minIsoDate(period.endDate, today);
    const dates = eachDateInRange(period.startDate, endCap);
    let count = 0;
    let failed = 0;
    let firstError: string | undefined;

    for (const emp of targets) {
      for (const date of dates) {
        try {
          await this.recalculateDay(emp.id, date, period);
          count++;
        } catch (e: unknown) {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          if (!firstError) firstError = `${emp.name || emp.id} @ ${date}: ${msg}`;
          console.error('[timesheet] recalculateDay failed', emp.id, date, e);
        }
      }
    }

    if (count === 0 && failed > 0) {
      throw new Error(firstError || 'recalcFailed');
    }

    return { count, failed, firstError };
  },

  async acknowledgeDay(dayId: string, who: 'employee' | 'manager', acked = true): Promise<void> {
    const payload =
      who === 'employee' ? { employee_ack: acked } : { manager_ack: acked };
    const { error } = await supabase.from('timesheet_days').update(payload).eq('id', dayId);
    if (error) throw error;
    apiClient.notify();
  },

  /** Bulk manager/employee acknowledgement for selected timesheet days. */
  async acknowledgeDays(dayIds: string[], who: 'employee' | 'manager', acked = true): Promise<number> {
    const ids = [...new Set(dayIds.filter(Boolean))];
    if (ids.length === 0) return 0;
    const payload =
      who === 'employee' ? { employee_ack: acked } : { manager_ack: acked };
    const { error, count } = await supabase
      .from('timesheet_days')
      .update(payload, { count: 'exact' })
      .in('id', ids);
    if (error) throw error;
    apiClient.notify();
    return count ?? ids.length;
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
      // Editing hours after approval requires a fresh manager ack.
      manager_ack: false,
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

  async listEmployeeReviews(periodId: string): Promise<TimesheetEmployeeReview[]> {
    if (!isSupabaseConfigured()) return [];
    const { data, error } = await supabase
      .from('timesheet_employee_reviews')
      .select('*')
      .eq('period_id', periodId)
      .order('employee_id');
    if (error) throw error;
    return (data ?? []).map(mapReview);
  },

  async getEmployeeReview(periodId: string, employeeKey: string): Promise<TimesheetEmployeeReview | null> {
    if (!isSupabaseConfigured()) return null;
    const employees = await employeeService.getEmployees();
    const emp = resolveEmployeeRecord(employees, employeeKey);
    const punchKey = punchKeyForEmployee(emp, employeeKey);
    const keys = [...new Set([employeeKey, emp?.id, punchKey].filter(Boolean))];

    for (const key of keys) {
      const { data, error } = await supabase
        .from('timesheet_employee_reviews')
        .select('*')
        .eq('period_id', periodId)
        .eq('employee_id', key)
        .maybeSingle();
      if (error) throw error;
      if (data) return mapReview(data);
    }
    return null;
  },

  async submitEmployeeReview(
    periodId: string,
    employeeKey: string,
    submittedBy: string,
    options?: { skipNotifications?: boolean }
  ): Promise<TimesheetEmployeeReview> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const employees = await employeeService.getEmployees();
    const emp = resolveEmployeeRecord(employees, employeeKey);
    if (!emp) throw new Error('Employee not found');

    const punchKey = punchKeyForEmployee(emp, employeeKey);
    const allDays = await this.listDays(periodId, punchKey);
    const scoped = daysForEmployee(allDays, emp, employeeKey);
    const validation = validateTimesheetEmployeeReview(scoped);
    if (!validation.canSubmit) {
      throw new Error(validation.blockingErrors[0] || 'reviewSubmitBlocked');
    }

    const now = new Date().toISOString();
    const row = {
      organization_id: orgId,
      period_id: periodId,
      employee_id: punchKey,
      profile_id: emp.id,
      status: 'IN_REVIEW' as TimesheetEmployeeReviewStatus,
      submitted_at: now,
      submitted_by: submittedBy,
      updated: now,
    };

    const { data, error } = await supabase
      .from('timesheet_employee_reviews')
      .upsert(row, { onConflict: 'period_id,employee_id' })
      .select()
      .single();
    if (error) throw error;

    if (!options?.skipNotifications) {
      await this.notifyTimesheetReviewSubmitted(emp, periodId, punchKey);
    }

    apiClient.notify();
    return mapReview(data);
  },

  async approveEmployeeReview(
    periodId: string,
    employeeKey: string,
    approvedBy: string,
    options?: { skipNotifications?: boolean }
  ): Promise<TimesheetEmployeeReview> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const employees = await employeeService.getEmployees();
    const emp = resolveEmployeeRecord(employees, employeeKey);
    if (!emp) throw new Error('Employee not found');

    const punchKey = punchKeyForEmployee(emp, employeeKey);
    const allDays = await this.listDays(periodId, punchKey);
    const scoped = daysForEmployee(allDays, emp, employeeKey);
    const validation = validateTimesheetEmployeeReview(scoped);
    if (!validation.canApprove) {
      throw new Error(validation.blockingErrors[0] || 'reviewApproveBlocked');
    }

    const existing = await this.getEmployeeReview(periodId, employeeKey);
    if (existing?.status === 'APPROVED') {
      return existing;
    }
    if (existing?.status !== 'EMPLOYEE_SIGNED') {
      throw new Error('reviewApproveNeedsEmployeeSign');
    }

    const now = new Date().toISOString();
    const upsertBase = {
      organization_id: orgId,
      period_id: periodId,
      employee_id: punchKey,
      profile_id: emp.id,
      status: 'APPROVED' as TimesheetEmployeeReviewStatus,
      approved_at: now,
      approved_by: approvedBy,
      updated: now,
    };

    const { data, error } = existing
      ? await supabase
          .from('timesheet_employee_reviews')
          .update({
            status: 'APPROVED',
            approved_at: now,
            approved_by: approvedBy,
            updated: now,
          })
          .eq('id', existing.id)
          .select()
          .single()
      : await supabase
          .from('timesheet_employee_reviews')
          .upsert(upsertBase, { onConflict: 'period_id,employee_id' })
          .select()
          .single();
    if (error) throw error;

    if (!options?.skipNotifications) {
      await this.notifyTimesheetReviewApproved(emp, periodId);
    }

    apiClient.notify();
    return mapReview(data);
  },

  async getPeriodLockReadiness(periodId: string): Promise<{
    totalEmployees: number;
    approvedCount: number;
    inReviewCount: number;
    openCount: number;
    canLock: boolean;
  }> {
    const employees = (await employeeService.getEmployees()).filter(
      e => !isNonPunchingStaff(e.role) && e.role !== 'SUPER_ADMIN',
    );
    const reviews = await this.listEmployeeReviews(periodId);
    const reviewByKey = new Map<string, TimesheetEmployeeReview>();
    for (const r of reviews) {
      reviewByKey.set(r.employeeId, r);
      if (r.profileId) reviewByKey.set(r.profileId, r);
    }

    let approvedCount = 0;
    let inReviewCount = 0;
    let openCount = 0;

    for (const emp of employees) {
      const key = emp.employeeId || emp.id;
      const rev =
        reviewByKey.get(key) ||
        reviewByKey.get(emp.id) ||
        reviewByKey.get(emp.employeeId || '');
      if (!rev || rev.status === 'OPEN') openCount++;
      else if (rev.status === 'IN_REVIEW' || rev.status === 'EMPLOYEE_SIGNED') inReviewCount++;
      else if (rev.status === 'APPROVED') approvedCount++;
    }

    const totalEmployees = employees.length;
    const canLock = totalEmployees > 0 && approvedCount === totalEmployees;

    return { totalEmployees, approvedCount, inReviewCount, openCount, canLock };
  },

  async lockPeriod(periodId: string, approvedBy: string, force = false): Promise<void> {
    if (!force) {
      const readiness = await this.getPeriodLockReadiness(periodId);
      if (!readiness.canLock) {
        throw new Error('reviewLockNotReady');
      }
    }
    await this.setPeriodStatus(periodId, 'LOCKED', approvedBy);
    await this.notifyTimesheetPeriodLocked(periodId);
  },

  async notifyTimesheetReviewSubmitted(emp: Employee, periodId: string, punchKey: string): Promise<void> {
    const period = (await this.listPeriods()).find(p => p.id === periodId);
    const label = period ? `${String(period.month).padStart(2, '0')}/${period.year}` : '';

    const bulk: Parameters<typeof notificationService.createBulkNotifications>[0] = [];
    if (emp.lineManagerId) {
      bulk.push({
        userId: emp.lineManagerId,
        type: 'ATTENDANCE' as const,
        title: 'Aprovar espelho de ponto',
        message: `O espelho de ${emp.name} (${label}) aguarda sua aprovação.`,
        referenceId: periodId,
        referenceType: 'timesheet_review',
        actionUrl: 'timesheet',
        metadata: { employeeId: punchKey, periodId, employeeName: emp.name },
      });
    }
    if (bulk.length === 0) return;
    await notificationService.createBulkNotifications(bulk);
  },

  async notifyTimesheetReviewApproved(emp: Employee, periodId: string): Promise<void> {
    const period = (await this.listPeriods()).find(p => p.id === periodId);
    const label = period ? `${String(period.month).padStart(2, '0')}/${period.year}` : '';
    await notificationService.createNotification({
      userId: emp.id,
      type: 'ATTENDANCE',
      title: 'Espelho aprovado',
      message: `Seu espelho de ponto da competência ${label} foi aprovado pelo gestor/RH.`,
      referenceId: periodId,
      referenceType: 'timesheet_review',
      actionUrl: 'timesheet',
    });
  },

  async notifyTimesheetPeriodLocked(periodId: string): Promise<void> {
    const period = (await this.listPeriods()).find(p => p.id === periodId);
    if (!period) return;
    const label = `${String(period.month).padStart(2, '0')}/${period.year}`;
    const employees = (await employeeService.getEmployees()).filter(
      e => e.role === 'ADMIN' || e.role === 'HR'
    );
    if (employees.length === 0) return;
    await notificationService.createBulkNotifications(
      employees.map(e => ({
        userId: e.id,
        type: 'ATTENDANCE' as const,
        title: 'Competência bloqueada',
        message: `A competência ${label} foi bloqueada para folha. Nenhuma edição adicional no espelho.`,
        referenceId: periodId,
        referenceType: 'timesheet_period',
        actionUrl: 'timesheet',
      }))
    );
  },

  async signEmployeeReview(
    periodId: string,
    employeeKey: string,
    payload: { selfieDataUrl: string; signatureDataUrl: string }
  ): Promise<TimesheetEmployeeReview> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const employees = await employeeService.getEmployees();
    const emp = resolveEmployeeRecord(employees, employeeKey);
    if (!emp) throw new Error('Employee not found');

    const punchKey = punchKeyForEmployee(emp, employeeKey);
    const existing = await this.getEmployeeReview(periodId, employeeKey);
    if (!existing || existing.status !== 'IN_REVIEW') {
      throw new Error('reviewNotInReview');
    }

    const basePath = `${orgId}/${periodId}/${emp.id}`;
    const selfieBlob = await convertToWebP(payload.selfieDataUrl, 0.65, 720);
    const signatureBlob = await convertToWebP(payload.signatureDataUrl, 0.85, 800);

    const selfiePath = `${basePath}/selfie.webp`;
    const signaturePath = `${basePath}/signature.webp`;

    const { error: selfieErr } = await supabase.storage
      .from(TIMESHEET_SIGN_BUCKET)
      .upload(selfiePath, selfieBlob, { upsert: true, contentType: 'image/webp' });
    if (selfieErr) throw selfieErr;

    const { error: signErr } = await supabase.storage
      .from(TIMESHEET_SIGN_BUCKET)
      .upload(signaturePath, signatureBlob, { upsert: true, contentType: 'image/webp' });
    if (signErr) throw signErr;

    const now = new Date().toISOString();
    const metadata = {
      signedAt: now,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    };

    const { data, error } = await supabase
      .from('timesheet_employee_reviews')
      .update({
        status: 'EMPLOYEE_SIGNED',
        employee_signed_at: now,
        employee_selfie_path: selfiePath,
        employee_signature_path: signaturePath,
        employee_sign_metadata: metadata,
        updated: now,
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;

    await this.notifyTimesheetReviewSigned(emp, periodId, punchKey);
    apiClient.notify();
    return mapReview(data);
  },

  async getTimesheetSignatureUrl(path?: string): Promise<string | null> {
    if (!path || !isSupabaseConfigured()) return null;
    const { data, error } = await supabase.storage
      .from(TIMESHEET_SIGN_BUCKET)
      .createSignedUrl(path, 3600);
    if (error) return null;
    return data.signedUrl;
  },

  async notifyTimesheetReviewSigned(emp: Employee, periodId: string, punchKey: string): Promise<void> {
    const period = (await this.listPeriods()).find(p => p.id === periodId);
    const label = period ? `${String(period.month).padStart(2, '0')}/${period.year}` : '';
    const bulk = [];
    if (emp.lineManagerId) {
      bulk.push({
        userId: emp.lineManagerId,
        type: 'ATTENDANCE' as const,
        title: 'Espelho assinado — aprovar',
        message: `${emp.name} assinou o espelho da competência ${label}. Aprove no espelho PTRP.`,
        referenceId: periodId,
        referenceType: 'timesheet_review',
        actionUrl: 'timesheet',
        metadata: { employeeId: punchKey, periodId, employeeName: emp.name },
      });
    }
    if (bulk.length > 0) {
      await notificationService.createBulkNotifications(bulk);
    }
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
