import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import type { RosterAssignmentStatus, RosterDayKind, WorkRosterAssignment } from '../types';
import { notificationService } from './notification.service';
import { employeeService } from './employee.service';
import { formatIsoDateBr } from '../i18n/format';
import { saturdaysInMonth } from '../utils/rosterDates';

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

/**
 * Resolve WORK/OFF from already-loaded assignments for one date.
 * No rows → null (unpublished). Match → that status. Listed day without the employee → OFF.
 */
export function rosterStatusFromAssignments(
  rowsForDate: WorkRosterAssignment[],
  employeeKeys: string[],
): RosterAssignmentStatus | null {
  if (!employeeKeys.length || rowsForDate.length === 0) return null;
  const keySet = new Set(employeeKeys.filter(Boolean));
  const match = rowsForDate.find(r => keySet.has(r.employeeId));
  if (match) return match.status;
  return 'OFF';
}

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
   * Passing an empty array clears the roster for that day.
   * Saturday then stays OFF in the timesheet (not a shift workingDays fallback).
   */
  async saveDay(params: {
    workDate: string;
    dayKind: RosterDayKind;
    assignments: Array<{ employeeId: string; status: RosterAssignmentStatus; notes?: string }>;
    createdBy?: string;
    notifyEmployees?: boolean;
  }): Promise<WorkRosterAssignment[]> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const { workDate, dayKind, assignments, createdBy, notifyEmployees = true } = params;

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

    const saved = (data ?? []).map(mapRow);
    apiClient.notify();

    // Notify assigned employees that the roster day was published/updated.
    if (notifyEmployees) {
      try {
        const employees = await employeeService.getEmployees();
        const byKey = new Map<string, string>();
        for (const e of employees) {
          byKey.set(e.id, e.id);
          if (e.employeeId) byKey.set(e.employeeId, e.id);
        }
        const dateLabel = formatIsoDateBr(workDate);
        const kindLabel = dayKind === 'HOLIDAY' ? 'feriado' : dayKind === 'SATURDAY' ? 'sábado' : 'dia';
        const bulk = [];
        for (const a of assignments) {
          const userId = byKey.get(a.employeeId);
          if (!userId) continue;
          const statusLabel = a.status === 'WORK' ? 'trabalha' : 'folga';
          bulk.push({
            userId,
            type: 'SYSTEM' as const,
            title: 'Escala atualizada',
            message: `Sua escala de ${kindLabel} (${dateLabel}) foi publicada: ${statusLabel}. Consulte Escalas no app.`,
            referenceId: workDate,
            referenceType: 'roster',
            actionUrl: 'my-roster',
            metadata: { workDate, status: a.status, dayKind },
          });
        }
        if (bulk.length > 0) {
          await notificationService.createBulkNotifications(bulk);
        }
      } catch (e) {
        console.error('[rosterService] notify after saveDay failed', e);
      }
    }

    return saved;
  },

  /** 
   * Copy Saturday assignments from one month to another based on ordinal index.
   * Does not copy holidays.
   */
  async copyMonthSaturdays(params: {
    sourceYear: number;
    sourceMonth: number;
    targetYear: number;
    targetMonth: number;
    createdBy?: string;
  }): Promise<{ copiedDates: Array<{ from: string; to: string }>; skippedEmpty: number }> {
    const sourceSaturdays = saturdaysInMonth(params.sourceYear, params.sourceMonth);
    const targetSaturdays = saturdaysInMonth(params.targetYear, params.targetMonth);

    const minLen = Math.min(sourceSaturdays.length, targetSaturdays.length);
    let skippedEmpty = 0;
    const copiedDates: Array<{ from: string; to: string }> = [];

    for (let i = 0; i < minLen; i++) {
      const sourceDate = sourceSaturdays[i]!;
      const targetDate = targetSaturdays[i]!;

      const assignments = await this.listForDate(sourceDate);
      if (assignments.length === 0) {
        skippedEmpty++;
        continue;
      }

      await this.saveDay({
        workDate: targetDate,
        dayKind: 'SATURDAY',
        assignments: assignments.map(a => ({
          employeeId: a.employeeId,
          status: a.status,
          notes: a.notes,
        })),
        createdBy: params.createdBy,
        notifyEmployees: false,
      });

      copiedDates.push({ from: sourceDate, to: targetDate });
    }

    return { copiedDates, skippedEmpty };
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
    return rosterStatusFromAssignments(rows, employeeKeys);
  },
};
