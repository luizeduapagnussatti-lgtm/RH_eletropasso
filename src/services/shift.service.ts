
import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import { Shift, ShiftOverride } from '../types';

let cachedShifts: Shift[] | null = null;
let cachedOverrides: ShiftOverride[] | null = null;

const mapShift = (r: any): Shift => ({
  id: r.id,
  name: r.name,
  code: r.code || undefined,
  scheduleType: r.schedule_type || 'FIXED',
  startTime: r.start_time,
  endTime: r.end_time,
  lateGracePeriod: r.late_grace_period,
  earlyOutGracePeriod: r.early_out_grace_period,
  earliestCheckIn: r.earliest_check_in,
  autoSessionCloseTime: r.auto_session_close_time,
  workingDays: r.working_days,
  isDefault: r.is_default,
  breakDurationMinutes: r.break_duration_minutes ?? 60,
  breakFlexible: r.break_flexible ?? true,
  breakEarliestStart: r.break_earliest_start || undefined,
  breakLatestEnd: r.break_latest_end || undefined,
  expectedDailyMinutes: r.expected_daily_minutes ?? 480,
  expectedWeeklyMinutes: r.expected_weekly_minutes ?? 2640,
  nightStart: r.night_start || '22:00',
  nightEnd: r.night_end || '05:00',
  overtimeToBank: r.overtime_to_bank ?? true,
  active: r.active ?? true,
  daySchedules: (r.day_schedules && typeof r.day_schedules === 'object') ? r.day_schedules : {},
});

const mapOverride = (r: any): ShiftOverride => ({
  id: r.id,
  employeeId: r.employee_id,
  shiftId: r.shift_id,
  startDate: r.start_date,
  endDate: r.end_date,
  reason: r.reason || '',
  organizationId: r.organization_id,
});

function shiftToPayload(shift: Partial<Shift>, orgId?: string) {
  const payload: Record<string, unknown> = {};
  if (shift.name !== undefined) payload.name = shift.name;
  if (shift.code !== undefined) payload.code = shift.code;
  if (shift.scheduleType !== undefined) payload.schedule_type = shift.scheduleType;
  if (shift.startTime !== undefined) payload.start_time = shift.startTime;
  if (shift.endTime !== undefined) payload.end_time = shift.endTime;
  if (shift.lateGracePeriod !== undefined) payload.late_grace_period = shift.lateGracePeriod;
  if (shift.earlyOutGracePeriod !== undefined) payload.early_out_grace_period = shift.earlyOutGracePeriod;
  if (shift.earliestCheckIn !== undefined) payload.earliest_check_in = shift.earliestCheckIn;
  if (shift.autoSessionCloseTime !== undefined) payload.auto_session_close_time = shift.autoSessionCloseTime;
  if (shift.workingDays !== undefined) payload.working_days = shift.workingDays;
  if (shift.isDefault !== undefined) payload.is_default = shift.isDefault;
  if (shift.breakDurationMinutes !== undefined) payload.break_duration_minutes = shift.breakDurationMinutes;
  if (shift.breakFlexible !== undefined) payload.break_flexible = shift.breakFlexible;
  if (shift.breakEarliestStart !== undefined) payload.break_earliest_start = shift.breakEarliestStart || null;
  if (shift.breakLatestEnd !== undefined) payload.break_latest_end = shift.breakLatestEnd || null;
  if (shift.expectedDailyMinutes !== undefined) payload.expected_daily_minutes = shift.expectedDailyMinutes;
  if (shift.expectedWeeklyMinutes !== undefined) payload.expected_weekly_minutes = shift.expectedWeeklyMinutes;
  if (shift.nightStart !== undefined) payload.night_start = shift.nightStart;
  if (shift.nightEnd !== undefined) payload.night_end = shift.nightEnd;
  if (shift.overtimeToBank !== undefined) payload.overtime_to_bank = shift.overtimeToBank;
  if (shift.active !== undefined) payload.active = shift.active;
  if (shift.daySchedules !== undefined) payload.day_schedules = shift.daySchedules ?? {};
  if (orgId) payload.organization_id = orgId;
  return payload;
}

export const shiftService = {
  clearCache() {
    cachedShifts = null;
    cachedOverrides = null;
  },

  async getShifts(): Promise<Shift[]> {
    if (cachedShifts) return cachedShifts;
    if (!isSupabaseConfigured()) {
      console.warn('[ShiftService] Supabase not configured');
      return [];
    }
    const orgId = apiClient.getOrganizationId();
    if (!orgId) {
      console.warn('[ShiftService] No organization ID available');
      return [];
    }
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('organization_id', orgId)
        .order('created', { ascending: false })
        .limit(200);
      if (error) throw error;
      cachedShifts = (data ?? []).map(mapShift);
      return cachedShifts;
    } catch (e: any) {
      console.error('[ShiftService] Failed to fetch shifts:', e?.message || e);
      return [];
    }
  },

  async createShift(shift: Partial<Shift>): Promise<Shift> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID available');

    if (shift.isDefault) await this.clearOtherDefaults();

    const payload = {
      name: shift.name,
      code: shift.code ?? null,
      schedule_type: shift.scheduleType ?? 'FIXED',
      start_time: shift.startTime,
      end_time: shift.endTime,
      late_grace_period: shift.lateGracePeriod ?? 15,
      early_out_grace_period: shift.earlyOutGracePeriod ?? 15,
      earliest_check_in: shift.earliestCheckIn ?? '06:00',
      auto_session_close_time: shift.autoSessionCloseTime ?? '23:59',
      working_days: shift.workingDays ?? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      is_default: shift.isDefault ?? false,
      break_duration_minutes: shift.breakDurationMinutes ?? 60,
      break_flexible: shift.breakFlexible ?? true,
      break_earliest_start: shift.breakEarliestStart || null,
      break_latest_end: shift.breakLatestEnd || null,
      expected_daily_minutes: shift.expectedDailyMinutes ?? 480,
      expected_weekly_minutes: shift.expectedWeeklyMinutes ?? 2640,
      night_start: shift.nightStart ?? '22:00',
      night_end: shift.nightEnd ?? '05:00',
      overtime_to_bank: shift.overtimeToBank ?? true,
      active: shift.active ?? true,
      day_schedules: shift.daySchedules ?? {},
      organization_id: orgId,
    };

    const { data, error } = await supabase.from('shifts').insert(payload).select().single();
    if (error) throw error;
    this.clearCache();
    apiClient.notify();
    return mapShift(data);
  },

  async updateShift(id: string, shift: Partial<Shift>): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const payload = shiftToPayload(shift);
    if (payload.is_default) await this.clearOtherDefaults(id);

    const { error } = await supabase.from('shifts').update(payload).eq('id', id);
    if (error) throw error;
    this.clearCache();
    apiClient.notify();
  },

  async deleteShift(id: string): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) throw error;
    this.clearCache();
    apiClient.notify();
    await this.ensureDefaultShift();
  },

  async clearOtherDefaults(exceptId?: string): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return;
    try {
      let query = supabase
        .from('shifts')
        .update({ is_default: false })
        .eq('organization_id', orgId)
        .eq('is_default', true);
      if (exceptId) query = query.neq('id', exceptId);
      const { error } = await query;
      if (error) throw error;
    } catch (e: any) {
      console.error('[ShiftService] Failed to clear other defaults:', e?.message || e);
    }
  },

  async ensureDefaultShift(): Promise<void> {
    if (!isSupabaseConfigured()) return;
    try {
      const shifts = await this.getShifts();
      if (shifts.length === 0) return;
      if (shifts.some(s => s.isDefault)) return;
      const { error } = await supabase
        .from('shifts')
        .update({ is_default: true })
        .eq('id', shifts[0].id);
      if (error) throw error;
      this.clearCache();
    } catch (e: any) {
      console.error('[ShiftService] Failed to ensure default shift:', e?.message || e);
    }
  },

  async getShiftOverrides(): Promise<ShiftOverride[]> {
    if (cachedOverrides) return cachedOverrides;
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];
    try {
      const { data, error } = await supabase
        .from('shift_overrides')
        .select('*')
        .eq('organization_id', orgId)
        .order('start_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      cachedOverrides = (data ?? []).map(mapOverride);
      return cachedOverrides;
    } catch (e: any) {
      console.error('[ShiftService] Failed to fetch overrides:', e?.message || e);
      return [];
    }
  },

  /** Replace org overrides with the provided list (upsert + delete removed). */
  async setShiftOverrides(overrides: ShiftOverride[]) {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID available');

    const existing = await this.getShiftOverrides();
    const keepIds = new Set(overrides.map(o => o.id).filter(id => id && !id.startsWith('so_')));

    const toDelete = existing.filter(e => !keepIds.has(e.id)).map(e => e.id);
    if (toDelete.length) {
      const { error } = await supabase.from('shift_overrides').delete().in('id', toDelete);
      if (error) throw error;
    }

    for (const o of overrides) {
      const isNew = !o.id || o.id.startsWith('so_');
      const row = {
        organization_id: orgId,
        employee_id: o.employeeId,
        shift_id: o.shiftId,
        start_date: o.startDate,
        end_date: o.endDate,
        reason: o.reason || null,
        updated: new Date().toISOString(),
      };
      if (isNew) {
        const { error } = await supabase.from('shift_overrides').insert(row);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('shift_overrides').update(row).eq('id', o.id);
        if (error) throw error;
      }
    }

    this.clearCache();
    cachedOverrides = null;
    apiClient.notify();
  },

  async resolveShiftForEmployee(
    employeeId: string,
    employeeShiftId: string | undefined,
    date?: string
  ): Promise<Shift | null> {
    const shifts = await this.getShifts();
    if (shifts.length === 0) return null;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const overrides = await this.getShiftOverrides();
    const activeOverride = overrides.find(
      o => o.employeeId === employeeId && targetDate >= o.startDate && targetDate <= o.endDate
    );
    if (activeOverride) {
      const overrideShift = shifts.find(s => s.id === activeOverride.shiftId);
      if (overrideShift) return overrideShift;
    }

    if (employeeShiftId) {
      const assignedShift = shifts.find(s => s.id === employeeShiftId);
      if (assignedShift) return assignedShift;
    }

    return shifts.find(s => s.isDefault && s.active !== false) || shifts.find(s => s.active !== false) || null;
  },
};
