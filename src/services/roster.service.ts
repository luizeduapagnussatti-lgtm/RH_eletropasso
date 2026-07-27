import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import type { RosterAssignmentStatus, RosterDayKind, WorkRosterAssignment } from '../types';

const mapRow = (r: any): WorkRosterAssignment => ({
  id: r.id,
  organizationId: r.organization_id,
  workDate: r.work_date,
  employeeId: r.employee_id,
  status: r.status,
  dayKind: r.day_kind,
  notes: r.notes || undefined,
  createdBy: r.created_by || undefined,
  created: r.created,
  updated: r.updated,
});

export const rosterService = {
  async listAssignments(startDate: string, endDate: string): Promise<WorkRosterAssignment[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('work_roster_assignments')
      .select('*')
      .eq('organization_id', orgId)
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date', { ascending: true });

    if (error) {
      console.error('[rosterService] listAssignments', error.message);
      return [];
    }
    return (data ?? []).map(mapRow);
  },

  async listForDate(workDate: string): Promise<WorkRosterAssignment[]> {
    return this.listAssignments(workDate, workDate);
  },

  /**
   * Replace all assignments for a date.
   * Passing an empty array clears the roster for that day (falls back to shift rules).
   */
  async saveDay(params: {
    workDate: string;
    dayKind: RosterDayKind;
    assignments: Array<{ employeeId: string; status: RosterAssignmentStatus; notes?: string }>;
    createdBy?: string;
  }): Promise<WorkRosterAssignment[]> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const { workDate, dayKind, assignments, createdBy } = params;

    const { error: delErr } = await supabase
      .from('work_roster_assignments')
      .delete()
      .eq('organization_id', orgId)
      .eq('work_date', workDate);
    if (delErr) throw delErr;

    if (assignments.length === 0) {
      apiClient.notify();
      return [];
    }

    const rows = assignments.map(a => ({
      organization_id: orgId,
      work_date: workDate,
      employee_id: a.employeeId,
      status: a.status,
      day_kind: dayKind,
      notes: a.notes || null,
      created_by: createdBy || null,
      updated: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('work_roster_assignments')
      .insert(rows)
      .select();
    if (error) throw error;

    apiClient.notify();
    return (data ?? []).map(mapRow);
  },

  /** Assignments for one employee in a date range. */
  async listForEmployee(employeeKeys: string[], startDate: string, endDate: string): Promise<WorkRosterAssignment[]> {
    const all = await this.listAssignments(startDate, endDate);
    const keySet = new Set(employeeKeys.filter(Boolean));
    return all.filter(a => keySet.has(a.employeeId));
  },

  /** Lookup helper for timesheet calc — null when no roster published for that date. */
  async getStatusForEmployee(
    workDate: string,
    employeeKeys: string[]
  ): Promise<RosterAssignmentStatus | null> {
    if (!employeeKeys.length) return null;
    const rows = await this.listForDate(workDate);
    if (rows.length === 0) return null;
    const keySet = new Set(employeeKeys.filter(Boolean));
    const match = rows.find(r => keySet.has(r.employeeId));
    if (match) return match.status;
    // Roster exists but employee not listed → treat as off
    return 'OFF';
  },
};
