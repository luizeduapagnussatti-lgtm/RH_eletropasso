import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import { Punch, PunchDirection, PunchSource } from '../types';

const mapPunch = (r: any): Punch => ({
  id: r.id,
  organizationId: r.organization_id,
  employeeId: r.employee_id,
  punchedAt: r.punched_at,
  direction: r.direction,
  source: r.source,
  deviceId: r.device_id || undefined,
  nsr: r.nsr || undefined,
  rawPayload: r.raw_payload || undefined,
  timesheetDayId: r.timesheet_day_id || undefined,
});

export interface PunchDaySummary {
  employeeId: string;
  date: string;
  firstIn?: string;
  lastOut?: string;
  punches: Punch[];
}

/** Pair punches for a calendar day (local date YYYY-MM-DD). */
export function consolidatePunchesForDay(punches: Punch[], date: string): PunchDaySummary {
  const dayPunches = punches
    .filter(p => p.punchedAt.slice(0, 10) === date || p.punchedAt.includes(date))
    .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));

  const ins = dayPunches.filter(p => p.direction === 'IN' || p.direction === 'UNKNOWN');
  const outs = dayPunches.filter(p => p.direction === 'OUT');

  return {
    employeeId: dayPunches[0]?.employeeId || '',
    date,
    firstIn: (ins[0] || dayPunches[0])?.punchedAt,
    lastOut: (outs[outs.length - 1] || (dayPunches.length > 1 ? dayPunches[dayPunches.length - 1] : undefined))?.punchedAt,
    punches: dayPunches,
  };
}

export const punchService = {
  async listPunches(opts: {
    employeeId?: string;
    startDate: string;
    endDate: string;
  }): Promise<Punch[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];

    let query = supabase
      .from('punches')
      .select('*')
      .eq('organization_id', orgId)
      .gte('punched_at', `${opts.startDate}T00:00:00`)
      .lte('punched_at', `${opts.endDate}T23:59:59.999`)
      .order('punched_at', { ascending: true })
      .limit(5000);

    if (opts.employeeId) query = query.eq('employee_id', opts.employeeId);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapPunch);
  },

  async createManualPunch(input: {
    employeeId: string;
    punchedAt: string;
    direction: PunchDirection;
    remarks?: string;
  }): Promise<Punch> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const payload = {
      organization_id: orgId,
      employee_id: input.employeeId,
      punched_at: input.punchedAt,
      direction: input.direction,
      source: 'MANUAL' as PunchSource,
      raw_payload: input.remarks ? { remarks: input.remarks } : null,
    };

    const { data, error } = await supabase.from('punches').insert(payload).select().single();
    if (error) throw error;
    apiClient.notify();
    return mapPunch(data);
  },

  async deletePunch(id: string): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { error } = await supabase.from('punches').delete().eq('id', id);
    if (error) throw error;
    apiClient.notify();
  },
};
