import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import { employeeService } from './employee.service';
import { notificationService } from './notification.service';
import type { Employee, PunchCorrectionRequest, PunchCorrectionStatus } from '../types';

const mapRow = (r: any, nameByKey?: Map<string, string>): PunchCorrectionRequest => ({
  id: r.id,
  organizationId: r.organization_id,
  employeeId: r.employee_id,
  profileId: r.profile_id || undefined,
  workDate: r.work_date,
  reason: r.reason || '',
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  resolvedAt: r.resolved_at || undefined,
  resolvedBy: r.resolved_by || undefined,
  resolverComment: r.resolver_comment || undefined,
  employeeName:
    nameByKey?.get(r.employee_id) ||
    nameByKey?.get(r.profile_id) ||
    undefined,
});

function nameMap(employees: Employee[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of employees) {
    if (e.id) m.set(e.id, e.name);
    if (e.employeeId) m.set(e.employeeId, e.name);
  }
  return m;
}

function punchKey(emp: Employee): string {
  return emp.employeeId || emp.id;
}

async function notifyManagersOfRequest(
  req: PunchCorrectionRequest,
  employeeName: string,
): Promise<void> {
  try {
    const employees = await employeeService.getEmployees();
    const managers = employees.filter(e =>
      e.status !== 'INACTIVE' &&
      (e.role === 'ADMIN' || e.role === 'HR' || e.role === 'MANAGER' || e.role === 'TEAM_LEAD')
    );
    if (managers.length === 0) return;
    await notificationService.createBulkNotifications(
      managers.map(m => ({
        userId: m.id,
        type: 'ATTENDANCE' as const,
        title: 'Solicitação de ajuste de ponto',
        message: `${employeeName} pediu ajuste em ${req.workDate}: ${req.reason.slice(0, 120)}`,
        priority: 'HIGH' as const,
        referenceId: req.id,
        referenceType: 'punch_correction',
        actionUrl: 'punch-corrections',
        metadata: { workDate: req.workDate, requestId: req.id },
      })),
    );
  } catch (e) {
    console.warn('[punchCorrection] manager notify failed', e);
  }
}

async function notifyEmployeeOfDecision(
  req: PunchCorrectionRequest,
  status: PunchCorrectionStatus,
): Promise<void> {
  if (!req.profileId) return;
  const approved = status === 'APPROVED';
  try {
    await notificationService.createNotification({
      userId: req.profileId,
      type: 'ATTENDANCE',
      title: approved ? 'Ajuste de ponto aprovado' : 'Ajuste de ponto recusado',
      message: approved
        ? `Seu pedido de ajuste em ${req.workDate} foi aprovado.`
        : `Seu pedido de ajuste em ${req.workDate} foi recusado.${req.resolverComment ? ` ${req.resolverComment}` : ''}`,
      priority: 'NORMAL',
      referenceId: req.id,
      referenceType: 'punch_correction',
      actionUrl: 'punch-corrections',
      metadata: { workDate: req.workDate, requestId: req.id, status },
    });
  } catch (e) {
    console.warn('[punchCorrection] employee notify failed', e);
  }
}

async function currentUserId(): Promise<string | undefined> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id;
}

export const punchCorrectionService = {
  async listMyRequests(profileId?: string): Promise<PunchCorrectionRequest[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];
    const uid = profileId || (await currentUserId());
    if (!uid) return [];

    const { data, error } = await supabase
      .from('punch_correction_requests')
      .select('*')
      .eq('organization_id', orgId)
      .eq('profile_id', uid)
      .order('work_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => mapRow(r));
  },

  async listPendingForManager(): Promise<PunchCorrectionRequest[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];

    const employees = await employeeService.getEmployees();
    const names = nameMap(employees);

    const { data, error } = await supabase
      .from('punch_correction_requests')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'PENDING')
      .order('work_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => mapRow(r, names));
  },

  async listForDates(params: {
    startDate: string;
    endDate: string;
    employeeId?: string;
  }): Promise<PunchCorrectionRequest[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];

    let q = supabase
      .from('punch_correction_requests')
      .select('*')
      .eq('organization_id', orgId)
      .gte('work_date', params.startDate)
      .lte('work_date', params.endDate)
      .order('work_date', { ascending: true });
    if (params.employeeId) q = q.eq('employee_id', params.employeeId);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(r => mapRow(r));
  },

  async createRequest(data: {
    employeeId?: string;
    profileId: string;
    workDate: string;
    reason: string;
  }): Promise<PunchCorrectionRequest> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const reason = data.reason.trim();
    if (!reason) throw new Error('reasonRequired');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.workDate)) throw new Error('invalidDate');

    const employees = await employeeService.getEmployees();
    const me = employees.find(e => e.id === data.profileId);
    const employeeId = data.employeeId || (me ? punchKey(me) : '');
    if (!employeeId) throw new Error('employeeNotFound');

    const { data: row, error } = await supabase
      .from('punch_correction_requests')
      .insert({
        organization_id: orgId,
        employee_id: employeeId,
        profile_id: data.profileId,
        work_date: data.workDate,
        reason,
        status: 'PENDING',
      })
      .select('*')
      .single();
    if (error) throw error;

    const mapped = mapRow(row);
    await notifyManagersOfRequest(mapped, me?.name || employeeId);
    apiClient.notify();
    return mapped;
  },

  async updateStatus(
    id: string,
    status: Extract<PunchCorrectionStatus, 'APPROVED' | 'REJECTED'>,
    resolverComment?: string,
  ): Promise<PunchCorrectionRequest> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const uid = await currentUserId();
    if (!uid) throw new Error('Not authenticated');

    if (status === 'REJECTED' && !(resolverComment || '').trim()) {
      throw new Error('resolverCommentRequired');
    }

    const { data: row, error } = await supabase
      .from('punch_correction_requests')
      .update({
        status,
        resolver_comment: (resolverComment || '').trim() || null,
        resolved_at: new Date().toISOString(),
        resolved_by: uid,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'PENDING')
      .select('*')
      .single();
    if (error) throw error;

    const mapped = mapRow(row);
    await notifyEmployeeOfDecision(mapped, status);
    apiClient.notify();
    return mapped;
  },

  async cancelRequest(id: string): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const uid = await currentUserId();
    if (!uid) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('punch_correction_requests')
      .update({
        status: 'CANCELLED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('profile_id', uid)
      .eq('status', 'PENDING');
    if (error) throw error;
    apiClient.notify();
  },
};
