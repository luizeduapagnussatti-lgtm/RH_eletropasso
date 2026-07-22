import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import { HourBankEntryType, HourBankLedgerEntry } from '../types';

const mapEntry = (r: any): HourBankLedgerEntry => ({
  id: r.id,
  organizationId: r.organization_id,
  employeeId: r.employee_id,
  entryDate: r.entry_date,
  minutesDelta: r.minutes_delta,
  entryType: r.entry_type,
  timesheetDayId: r.timesheet_day_id || undefined,
  periodId: r.period_id || undefined,
  balanceAfter: r.balance_after ?? undefined,
  createdBy: r.created_by || undefined,
  notes: r.notes || undefined,
  created: r.created,
});

export const hourBankService = {
  async listEntries(employeeId: string, startDate?: string, endDate?: string): Promise<HourBankLedgerEntry[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];

    let q = supabase
      .from('hour_bank_ledger')
      .select('*')
      .eq('organization_id', orgId)
      .eq('employee_id', employeeId)
      .order('entry_date', { ascending: true })
      .order('created', { ascending: true })
      .limit(2000);

    if (startDate) q = q.gte('entry_date', startDate);
    if (endDate) q = q.lte('entry_date', endDate);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapEntry);
  },

  async getBalance(employeeId: string): Promise<number> {
    const entries = await this.listEntries(employeeId);
    return entries.reduce((sum, e) => sum + e.minutesDelta, 0);
  },

  async addEntry(input: {
    employeeId: string;
    entryDate: string;
    minutesDelta: number;
    entryType: HourBankEntryType;
    timesheetDayId?: string;
    periodId?: string;
    notes?: string;
    createdBy?: string;
  }): Promise<HourBankLedgerEntry> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const balance = (await this.getBalance(input.employeeId)) + input.minutesDelta;

    const { data, error } = await supabase
      .from('hour_bank_ledger')
      .insert({
        organization_id: orgId,
        employee_id: input.employeeId,
        entry_date: input.entryDate,
        minutes_delta: input.minutesDelta,
        entry_type: input.entryType,
        timesheet_day_id: input.timesheetDayId || null,
        period_id: input.periodId || null,
        balance_after: balance,
        created_by: input.createdBy || null,
        notes: input.notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    apiClient.notify();
    return mapEntry(data);
  },

  /** Remove auto-generated OT/absence lines for a day before re-calc. */
  async clearAutoEntriesForDay(timesheetDayId: string): Promise<void> {
    if (!isSupabaseConfigured()) return;
    await supabase
      .from('hour_bank_ledger')
      .delete()
      .eq('timesheet_day_id', timesheetDayId)
      .in('entry_type', ['OT_CREDIT', 'ABSENCE_DEBIT']);
  },
};
