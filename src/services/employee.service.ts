
import { supabase, isSupabaseConfigured, getSupabaseStorageUrl } from './supabase';
import { apiClient, dedupe, resolveOrgId } from './api.client';
import { Employee, ClockOnboardingStatus } from '../types';
import { normalizePis, validatePis, normalizeCpf, validateCpf, normalizeClockCredential, validateClockCredential, resolveClockCredential } from '../utils/employeeCredentials';
import { needsClockAdmission } from '../utils/roles';

let cachedEmployees: Employee[] | null = null;
let empCacheTimestamp = 0;
const EMP_CACHE_TTL = 2 * 60 * 1000;

const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : null;

function mapProfileToEmployee(r: any): Employee {
  return {
    id: r.id,
    employeeId: r.employee_id || '',
    lineManagerId: r.line_manager_id || undefined,
    teamId: r.team_id || undefined,
    shiftId: r.shift_id || undefined,
    organizationId: r.organization_id,
    name: r.name || 'No Name',
    email: r.email || r.work_email || '',
    role: (r.role || 'EMPLOYEE').toUpperCase(),
    department: r.department || 'Unassigned',
    designation: r.designation || 'Staff',
    avatar: r.avatar ? getSupabaseStorageUrl('avatars', r.avatar) : undefined,
    joiningDate: r.joining_date || '',
    mobile: r.mobile || '',
    emergencyContact: r.emergency_contact || '',
    salary: r.salary || 0,
    status: r.status || 'ACTIVE',
    employmentType: r.employment_type || 'PERMANENT',
    location: r.location || '',
    workType: r.work_type || 'OFFICE',
    cpf: r.cpf || undefined,
    clockCredential: r.clock_credential || undefined,
    verified: !!r.verified,
    clockOnboardingStatus: r.clock_onboarding_status as ClockOnboardingStatus | undefined,
    clockOnboardingAt: r.clock_onboarding_at || undefined,
    clockOnboardingNotes: r.clock_onboarding_notes || undefined,
  } as Employee;
}

async function assertUniquePis(orgId: string | null | undefined, pis: string, excludeId?: string) {
  if (!orgId || !pis) return;
  let q = supabase
    .from('profiles')
    .select('id')
    .eq('organization_id', orgId)
    .eq('employee_id', pis);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.maybeSingle();
  if (data) throw new Error('PIS already registered for another employee');
}

async function assertUniqueClockCredential(
  orgId: string | null | undefined,
  cred: string,
  excludeId?: string
) {
  if (!orgId || !cred) return;
  let q = supabase
    .from('profiles')
    .select('id')
    .eq('organization_id', orgId)
    .eq('clock_credential', cred);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.maybeSingle();
  if (data) throw new Error('Clock credential already registered for another employee');
}

export const employeeService = {
  clearCache() {
    cachedEmployees = null;
    empCacheTimestamp = 0;
  },

  async getEmployees(): Promise<Employee[]> {
    if (cachedEmployees && Date.now() - empCacheTimestamp < EMP_CACHE_TTL) return cachedEmployees;

    const orgId = await resolveOrgId();
    return dedupe(`employees:${orgId ?? 'none'}`, async () => {
      if (!isSupabaseConfigured()) {
        console.warn('[EmployeeService] Supabase not configured');
        return [];
      }
      try {
        let query = supabase
          .from('profiles')
          .select('*')
          .order('created', { ascending: false });

        if (orgId) query = query.eq('organization_id', orgId);

        const { data, error } = await query;
        if (error) throw error;

        console.log(`[EmployeeService] Fetched ${data?.length ?? 0} employees`);
        const result = (data ?? []).map(mapProfileToEmployee);
        cachedEmployees = result;
        empCacheTimestamp = Date.now();
        return result;
      } catch (e: any) {
        console.error('[EmployeeService] Failed to fetch employees:', e?.message || e);
        return [];
      }
    });
  },

  async addEmployee(emp: Partial<Employee>) {
    if (!isSupabaseConfigured() || !SUPABASE_FUNCTIONS_URL) return;

    const role = (emp.role || 'EMPLOYEE').toUpperCase();
    if (needsClockAdmission(role)) {
      const pisCheck = validatePis(emp.employeeId);
      if (!pisCheck.ok) throw new Error('Invalid PIS');
      const credCheck = validateClockCredential(emp.clockCredential);
      if (!credCheck.ok) throw new Error('Invalid clock credential');
    }
    if (emp.cpf) {
      const cpfCheck = validateCpf(emp.cpf);
      if (!cpfCheck.ok) throw new Error('Invalid CPF');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const normalizedPis = emp.employeeId ? normalizePis(emp.employeeId) : '';
    const normalizedCred = resolveClockCredential(emp.clockCredential, emp.employeeId);

    const formData = new FormData();
    if (emp.email)       formData.append('email', emp.email);
    if ((emp as any).password) formData.append('password', (emp as any).password);
    if (emp.name)        formData.append('name', emp.name);
    formData.append('role', role);
    if (emp.department)  formData.append('department', emp.department);
    if (emp.designation) formData.append('designation', emp.designation);
    if (normalizedPis)   formData.append('employeeId', normalizedPis);
    if (normalizedCred)  formData.append('clockCredential', normalizedCred);
    if (emp.lineManagerId) formData.append('lineManagerId', emp.lineManagerId);
    if (emp.teamId)      formData.append('teamId', emp.teamId);
    if (emp.shiftId)     formData.append('shiftId', emp.shiftId);
    if (emp.mobile)      formData.append('mobile', emp.mobile);
    if (emp.joiningDate) formData.append('joiningDate', emp.joiningDate);
    if (emp.employmentType) formData.append('employmentType', emp.employmentType);
    if (emp.workType)    formData.append('workType', emp.workType);
    if (emp.location)    formData.append('location', emp.location);
    if (emp.emergencyContact) formData.append('emergencyContact', emp.emergencyContact);
    if (emp.cpf)         formData.append('cpf', normalizeCpf(emp.cpf));
    if (emp.status)      formData.append('status', emp.status);

    // Avatar: data URL → Blob
    if (emp.avatar && typeof emp.avatar === 'string' && emp.avatar.startsWith('data:')) {
      const blob = await (await fetch(emp.avatar)).blob();
      formData.append('avatar', blob, 'avatar.webp');
    }

    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-employee`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: formData,
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to create employee');

    employeeService.clearCache();
    apiClient.notify();
  },

  async updateProfile(id: string, updates: Partial<Employee> | any) {
    if (!isSupabaseConfigured()) return;

    const orgId = await resolveOrgId();
    const payload: any = {};
    if (updates.name !== undefined)        payload.name = updates.name;
    if (updates.role !== undefined)        payload.role = updates.role.toUpperCase();
    if (updates.department !== undefined)  payload.department = updates.department;
    if (updates.designation !== undefined) payload.designation = updates.designation;
    if (updates.employeeId !== undefined) {
      const pis = normalizePis(updates.employeeId);
      if (pis && needsClockAdmission(updates.role || 'EMPLOYEE')) {
        const pisCheck = validatePis(updates.employeeId);
        if (!pisCheck.ok) throw new Error('Invalid PIS');
      }
      if (pis) await assertUniquePis(orgId, pis, id);
      payload.employee_id = pis || null;
    }
    if (updates.clockCredential !== undefined) {
      const credCheck = validateClockCredential(updates.clockCredential);
      if (!credCheck.ok) throw new Error('Invalid clock credential');
      const cred = normalizeClockCredential(updates.clockCredential);
      if (cred) await assertUniqueClockCredential(orgId, cred, id);
      payload.clock_credential = cred || null;
    }
    if (updates.cpf !== undefined) {
      const cpf = normalizeCpf(updates.cpf);
      if (cpf) {
        const cpfCheck = validateCpf(cpf);
        if (!cpfCheck.ok) throw new Error('Invalid CPF');
      }
      payload.cpf = cpf || null;
    }
    if (updates.mobile !== undefined)      payload.mobile = updates.mobile;
    if (updates.joiningDate !== undefined) payload.joining_date = updates.joiningDate;
    if (updates.employmentType !== undefined) payload.employment_type = updates.employmentType;
    if (updates.workType !== undefined)    payload.work_type = updates.workType;
    if (updates.salary !== undefined)      payload.salary = updates.salary;
    if (updates.location !== undefined)    payload.location = updates.location;
    if (updates.emergencyContact !== undefined) payload.emergency_contact = updates.emergencyContact;
    if (updates.status !== undefined)      payload.status = updates.status;
    if (updates.clockOnboardingStatus !== undefined) {
      payload.clock_onboarding_status = updates.clockOnboardingStatus;
      payload.clock_onboarding_at = new Date().toISOString();
    }
    if (updates.clockOnboardingNotes !== undefined) {
      payload.clock_onboarding_notes = updates.clockOnboardingNotes;
    }

    const lmId = updates.lineManagerId ?? updates.line_manager_id;
    if (lmId !== undefined) payload.line_manager_id = lmId === '' ? null : lmId;

    const tId = updates.teamId ?? updates.team_id;
    if (tId !== undefined) payload.team_id = tId === '' ? null : tId;

    const sId = updates.shiftId ?? updates.shift_id;
    if (sId !== undefined) payload.shift_id = sId === '' ? null : sId;

    // Avatar upload to storage
    if (updates.avatar && typeof updates.avatar === 'string' && updates.avatar.startsWith('data:')) {
      try {
        const blob = await (await fetch(updates.avatar)).blob();
        const path = `${id}/avatar.webp`;
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(path, blob, { upsert: true, contentType: 'image/webp' });
        if (!uploadErr) payload.avatar = path;
      } catch (e) {
        console.warn('[EmployeeService] Avatar upload failed:', e);
      }
    }

    // Self-service password change via supabase.auth.updateUser.
    // Only works for the currently authenticated user changing their own password.
    if (updates.password) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) {
        throw new Error('No active session. Please log in again.');
      }

      // Verify current password before allowing change
      if (updates.oldPassword) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: session.user.email,
          password: updates.oldPassword,
        });
        if (signInError) {
          throw new Error('Current password is incorrect.');
        }
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: updates.password,
      });
      if (updateError) throw updateError;
    }

    console.log('[EmployeeService] Updating profile:', id, payload);
    const { error } = await supabase.from('profiles').update(payload).eq('id', id);
    if (error) throw error;

    employeeService.clearCache();
    apiClient.notify();
  },

  async deleteEmployee(id: string) {
    if (!isSupabaseConfigured()) return;

    // Deleting from profiles cascades to auth.users via FK (on delete cascade).
    // Service-role is needed to delete auth.users — use Edge Function if RLS blocks.
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) throw error;

    employeeService.clearCache();
    apiClient.notify();
  },
};
