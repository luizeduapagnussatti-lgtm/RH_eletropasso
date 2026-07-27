import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import { employeeService } from './employee.service';
import { notificationService } from './notification.service';
import { rosterService } from './roster.service';
import { timesheetService } from './timesheet.service';
import { needsClockAdmission } from '../utils/roles';
import type { Employee, RosterDayKind, RosterSwapRequest, RosterSwapStatus } from '../types';

const mapRow = (r: any): RosterSwapRequest => ({
  id: r.id,
  organizationId: r.organization_id,
  workDate: r.work_date,
  dayKind: r.day_kind,
  requesterEmployeeId: r.requester_employee_id,
  requesterProfileId: r.requester_profile_id || undefined,
  targetEmployeeId: r.target_employee_id,
  targetProfileId: r.target_profile_id || undefined,
  status: r.status,
  reason: r.reason || undefined,
  peerRespondedAt: r.peer_responded_at || undefined,
  resolvedAt: r.resolved_at || undefined,
  resolvedBy: r.resolved_by || undefined,
  created: r.created,
  updated: r.updated,
});

function resolveEmployee(employees: Employee[], profileId: string): Employee | undefined {
  return employees.find(e => e.id === profileId);
}

function punchKey(emp: Employee): string {
  return emp.employeeId || emp.id;
}

async function notifySwap(
  userId: string,
  title: string,
  message: string,
  workDate: string
): Promise<void> {
  await notificationService.createNotification({
    userId,
    type: 'ATTENDANCE',
    title,
    message,
    referenceId: workDate,
    referenceType: 'roster_swap',
    actionUrl: 'my-roster',
  });
}

export const rosterSwapService = {
  async listForProfile(profileId: string): Promise<RosterSwapRequest[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('roster_swap_requests')
      .select('*')
      .eq('organization_id', orgId)
      .or(`requester_profile_id.eq.${profileId},target_profile_id.eq.${profileId}`)
      .order('created', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async listPendingManager(): Promise<RosterSwapRequest[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('roster_swap_requests')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'PENDING_MANAGER')
      .order('created', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async createRequest(params: {
    workDate: string;
    dayKind: RosterDayKind;
    requesterProfileId: string;
    targetProfileId: string;
    reason?: string;
  }): Promise<RosterSwapRequest> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const employees = await employeeService.getEmployees();
    const requester = resolveEmployee(employees, params.requesterProfileId);
    const target = resolveEmployee(employees, params.targetProfileId);
    if (!requester || !target) throw new Error('Employee not found');
    if (requester.id === target.id) throw new Error('swapSameEmployee');

    const today = new Date().toISOString().slice(0, 10);
    if (params.workDate <= today) throw new Error('swapPastDate');

    const row = {
      organization_id: orgId,
      work_date: params.workDate,
      day_kind: params.dayKind,
      requester_employee_id: punchKey(requester),
      requester_profile_id: requester.id,
      target_employee_id: punchKey(target),
      target_profile_id: target.id,
      status: 'PENDING_PEER' as RosterSwapStatus,
      reason: params.reason?.trim() || null,
    };

    const { data, error } = await supabase
      .from('roster_swap_requests')
      .insert(row)
      .select()
      .single();
    if (error) throw error;

    await notifySwap(
      target.id,
      'Pedido de troca de escala',
      `${requester.name} quer trocar a escala de ${params.workDate}.`,
      params.workDate
    );

    apiClient.notify();
    return mapRow(data);
  },

  async respondPeer(requestId: string, accept: boolean, profileId: string): Promise<RosterSwapRequest> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data: existing, error: fetchErr } = await supabase
      .from('roster_swap_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    if (fetchErr) throw fetchErr;
    if (existing.target_profile_id !== profileId) throw new Error('swapNotTarget');
    if (existing.status !== 'PENDING_PEER') throw new Error('swapInvalidStatus');

    const now = new Date().toISOString();
    const employees = await employeeService.getEmployees();
    const requester = employees.find(e => e.id === existing.requester_profile_id);
    const target = employees.find(e => e.id === existing.target_profile_id);

    if (!accept) {
      const { data, error } = await supabase
        .from('roster_swap_requests')
        .update({ status: 'REJECTED', peer_responded_at: now, resolved_at: now, resolved_by: profileId, updated: now })
        .eq('id', requestId)
        .select()
        .single();
      if (error) throw error;
      if (requester) {
        await notifySwap(requester.id, 'Troca recusada', `Seu pedido de troca em ${existing.work_date} foi recusado.`, existing.work_date);
      }
      apiClient.notify();
      return mapRow(data);
    }

    const { data, error } = await supabase
      .from('roster_swap_requests')
      .update({ status: 'PENDING_MANAGER', peer_responded_at: now, updated: now })
      .eq('id', requestId)
      .select()
      .single();
    if (error) throw error;

    if (requester?.lineManagerId) {
      await notifySwap(
        requester.lineManagerId,
        'Aprovar troca de escala',
        `${requester.name} e ${target?.name ?? 'colega'} aguardam aprovação da troca em ${existing.work_date}.`,
        existing.work_date
      );
    }

    apiClient.notify();
    return mapRow(data);
  },

  async approveManager(requestId: string, managerId: string): Promise<RosterSwapRequest> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const { data: existing, error: fetchErr } = await supabase
      .from('roster_swap_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    if (fetchErr) throw fetchErr;
    if (existing.status !== 'PENDING_MANAGER') throw new Error('swapInvalidStatus');

    const employees = (await employeeService.getEmployees()).filter(
      e => needsClockAdmission(e.role) && e.status !== 'INACTIVE'
    );
    const requester = employees.find(e => e.id === existing.requester_profile_id);
    const target = employees.find(e => e.id === existing.target_profile_id);
    if (!requester || !target) throw new Error('Employee not found');

    const rows = await rosterService.listForDate(existing.work_date);
    const statusByEmp: Record<string, 'WORK' | 'OFF'> = {};
    for (const emp of employees) {
      const keys = [emp.id, emp.employeeId].filter(Boolean) as string[];
      const hit = rows.find(r => keys.includes(r.employeeId));
      statusByEmp[emp.id] = hit?.status ?? 'OFF';
    }
    const reqStatus = statusByEmp[requester.id] ?? 'OFF';
    const tgtStatus = statusByEmp[target.id] ?? 'OFF';
    statusByEmp[requester.id] = tgtStatus;
    statusByEmp[target.id] = reqStatus;

    const assignments = employees.map(e => ({
      employeeId: e.employeeId || e.id,
      status: statusByEmp[e.id] ?? 'OFF',
    }));

    await rosterService.saveDay({
      workDate: existing.work_date,
      dayKind: existing.day_kind,
      assignments,
      createdBy: managerId,
    });

    await Promise.all(
      employees.map(e =>
        timesheetService.recalculateDay(e.employeeId || e.id, existing.work_date).catch(() => null)
      )
    );

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('roster_swap_requests')
      .update({ status: 'APPROVED', resolved_at: now, resolved_by: managerId, updated: now })
      .eq('id', requestId)
      .select()
      .single();
    if (error) throw error;

    await notificationService.createBulkNotifications([
      {
        userId: requester.id,
        type: 'ATTENDANCE',
        title: 'Troca aprovada',
        message: `A troca de escala em ${existing.work_date} foi aprovada.`,
        referenceId: existing.work_date,
        referenceType: 'roster_swap',
        actionUrl: 'my-roster',
      },
      {
        userId: target.id,
        type: 'ATTENDANCE',
        title: 'Troca aprovada',
        message: `A troca de escala em ${existing.work_date} foi aprovada.`,
        referenceId: existing.work_date,
        referenceType: 'roster_swap',
        actionUrl: 'my-roster',
      },
    ]);

    apiClient.notify();
    return mapRow(data);
  },

  async cancelRequest(requestId: string, profileId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('roster_swap_requests')
      .update({ status: 'CANCELLED', resolved_at: now, resolved_by: profileId, updated: now })
      .eq('id', requestId)
      .eq('requester_profile_id', profileId)
      .eq('status', 'PENDING_PEER');
    if (error) throw error;
    apiClient.notify();
  },
};
