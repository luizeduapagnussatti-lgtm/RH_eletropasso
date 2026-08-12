
import { supabase, isSupabaseConfigured, getSupabaseStorageUrl } from './supabase';
import { apiClient, dedupe, resolveOrgId } from './api.client';
import { Employee, ClockOnboardingStatus } from '../types';
import { normalizePis, validatePis, normalizeCpf, validateCpf, normalizeClockCredential, validateClockCredential } from '../utils/employeeCredentials';
import { normalizePhoneE164BR } from '../utils/phoneUtils';
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
    name: r.name || '',
    email: r.email || r.work_email || '',
    role: (r.role || 'EMPLOYEE').toUpperCase(),
    department: r.department || '',
    designation: r.designation || '',
    avatar: r.avatar ? getSupabaseStorageUrl('avatars', r.avatar) : undefined,
    joiningDate: r.joining_date || '',
    terminationDate: r.termination_date || undefined,
    mobile: r.mobile || '',
    whatsappE164: r.whatsapp_e164 || undefined,
    whatsappOptIn: !!r.whatsapp_opt_in,
    messagingChannelPref: (r.messaging_channel_pref || ['APP', 'EMAIL']) as Employee['messagingChannelPref'],
    emergencyContact: r.emergency_contact || '',
    salary: r.salary || 0,
    status: r.status || 'ACTIVE',
    employmentType: r.employment_type || 'PERMANENT',
    location: r.location || '',
    workType: r.work_type || 'OFFICE',
    cpf: r.cpf || undefined,
    clockCredential: r.clock_credential || undefined,
    clockBiometricRegistered: !!r.clock_biometric_registered,
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

/** Stable codes so the onboarding UI can translate API errors. */
function mapCreateEmployeeApiError(raw: string): string {
  if (/Email already registered for another active employee/i.test(raw)) {
    return 'EMAIL_ACTIVE_CONFLICT';
  }
  if (/Email already registered in authentication|Email already in use/i.test(raw)) {
    return 'EMAIL_AUTH_CONFLICT';
  }
  if (/Email still locked on a discharged account/i.test(raw)) {
    return 'EMAIL_LOCKED_DISCHARGED';
  }
  if (/PIS already registered/i.test(raw)) return 'PIS_CONFLICT';
  if (/Clock credential already registered/i.test(raw)) return 'CREDENTIAL_CONFLICT';
  if (/Invalid or missing PIS/i.test(raw)) return 'PIS_INVALID';
  if (/Invalid CPF/i.test(raw)) return 'CPF_INVALID';
  if (/Password must be at least 8/i.test(raw)) return 'PASSWORD_SHORT';
  if (/Missing required fields/i.test(raw)) return 'MISSING_FIELDS';
  return raw;
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
    if (needsClockAdmission({ role, employmentType: emp.employmentType })) {
      const pisCheck = validatePis(emp.employeeId);
      if (!pisCheck.ok) throw new Error('Invalid PIS');
    }
    if (emp.cpf) {
      const cpfCheck = validateCpf(emp.cpf);
      if (!cpfCheck.ok) throw new Error('Invalid CPF');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const normalizedPis = emp.employeeId ? normalizePis(emp.employeeId) : '';

    const formData = new FormData();
    if (emp.email)       formData.append('email', emp.email);
    if ((emp as any).password) formData.append('password', (emp as any).password);
    if (emp.name)        formData.append('name', emp.name);
    formData.append('role', role);
    if (emp.department)  formData.append('department', emp.department);
    if (emp.designation) formData.append('designation', emp.designation);
    if (normalizedPis)   formData.append('employeeId', normalizedPis);
    if (emp.lineManagerId) formData.append('lineManagerId', emp.lineManagerId);
    if (emp.teamId)      formData.append('teamId', emp.teamId);
    if (emp.shiftId)     formData.append('shiftId', emp.shiftId);
    if (emp.mobile)      formData.append('mobile', emp.mobile);
    if (emp.whatsappOptIn !== undefined) formData.append('whatsappOptIn', emp.whatsappOptIn ? 'true' : 'false');
    if (emp.messagingChannelPref?.length) {
      formData.append('messagingChannelPref', JSON.stringify(emp.messagingChannelPref));
    }
    if (emp.joiningDate) formData.append('joiningDate', emp.joiningDate);
    if (emp.employmentType) formData.append('employmentType', emp.employmentType);
    if (emp.workType)    formData.append('workType', emp.workType);
    if (emp.location)    formData.append('location', emp.location);
    if (emp.emergencyContact) formData.append('emergencyContact', emp.emergencyContact);
    if (emp.cpf)         formData.append('cpf', normalizeCpf(emp.cpf));
    if (emp.status)      formData.append('status', emp.status);
    if (emp.clockBiometricRegistered !== undefined) {
      formData.append('clockBiometricRegistered', emp.clockBiometricRegistered ? 'true' : 'false');
    }

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
    if (!res.ok) {
      const raw = String(json.message || json.error || 'Failed to create employee');
      throw new Error(mapCreateEmployeeApiError(raw));
    }

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
      if (pis && needsClockAdmission({ role: updates.role || 'EMPLOYEE', employmentType: updates.employmentType })) {
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
    if (updates.mobile !== undefined) {
      payload.mobile = updates.mobile;
      payload.whatsapp_e164 = normalizePhoneE164BR(updates.mobile) || null;
    }
    if (updates.whatsappOptIn !== undefined) payload.whatsapp_opt_in = !!updates.whatsappOptIn;
    if (updates.messagingChannelPref !== undefined) payload.messaging_channel_pref = updates.messagingChannelPref;
    if (updates.joiningDate !== undefined) payload.joining_date = updates.joiningDate || null;
    if (updates.terminationDate !== undefined) {
      payload.termination_date = updates.terminationDate || null;
    }
    if (updates.employmentType !== undefined) {
      payload.employment_type = updates.employmentType;
      if (String(updates.employmentType).toUpperCase() === 'PJ') {
        payload.clock_onboarding_status = 'NOT_APPLICABLE';
        payload.clock_onboarding_at = new Date().toISOString();
      }
    }
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
    if (updates.clockBiometricRegistered !== undefined) {
      payload.clock_biometric_registered = !!updates.clockBiometricRegistered;
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

    const nextEmail = typeof updates.email === 'string' ? updates.email.trim().toLowerCase() : '';
    const nextPassword = typeof updates.password === 'string' ? updates.password : '';
    const { data: { session } } = await supabase.auth.getSession();
    const isSelf = session?.user?.id === id;

    // Admin/HR changing another user's login (email and/or password) via Edge Function.
    if (!isSelf && (nextEmail || nextPassword) && SUPABASE_FUNCTIONS_URL && session?.access_token) {
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/update-employee-access`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeId: id,
          ...(nextEmail ? { email: nextEmail } : {}),
          ...(nextPassword ? { password: nextPassword } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || json.message || 'Failed to update employee login');
      }
    } else if (isSelf && nextPassword) {
      // Self-service password change via supabase.auth.updateUser.
      if (!session?.user?.email) {
        throw new Error('No active session. Please log in again.');
      }
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
        password: nextPassword,
      });
      if (updateError) throw updateError;
    } else if (isSelf && nextEmail && nextEmail !== session?.user?.email?.toLowerCase()) {
      // Changing own login email also needs the admin Edge Function (or invite flow).
      if (!SUPABASE_FUNCTIONS_URL || !session?.access_token) {
        throw new Error('Cannot update email without Edge Function');
      }
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/update-employee-access`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ employeeId: id, email: nextEmail }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || json.message || 'Failed to update email');
      }
    }

    console.log('[EmployeeService] Updating profile:', id, payload);
    if (Object.keys(payload).length > 0) {
      const { error } = await supabase.from('profiles').update(payload).eq('id', id);
      if (error) throw error;
    }

    employeeService.clearCache();

    // When admission/demissão dates change, purge out-of-window days + auto bank.
    if (updates.joiningDate !== undefined || updates.terminationDate !== undefined) {
      try {
        const { timesheetService } = await import('./timesheet.service');
        const fresh = (await this.getEmployees()).find(e => e.id === id);
        await timesheetService.closeEmploymentWindow(id, {
          joiningDate: fresh?.joiningDate ?? updates.joiningDate ?? null,
          terminationDate: fresh?.terminationDate ?? updates.terminationDate ?? null,
        });
      } catch (e) {
        console.warn('[EmployeeService] closeEmploymentWindow failed:', e);
      }
    }

    apiClient.notify();
  },

  /**
   * Release reusable corporate login e-mail from a profile (typically after
   * discharge). Keeps the auth row under released.<id>@inactive.eletropasso.local.
   * Import/synthetic addresses are left alone.
   */
  async releaseCorporateEmail(id: string, currentEmail?: string | null): Promise<boolean> {
    if (!isSupabaseConfigured() || !SUPABASE_FUNCTIONS_URL) return false;
    const email = String(currentEmail ?? '').trim().toLowerCase();
    if (!email) return false;
    if (email.endsWith('@inactive.eletropasso.local')) return false;
    if (email.endsWith('@import.eletropasso.local')) return false;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return false;

    const freed = `released.${id.replace(/-/g, '')}@inactive.eletropasso.local`;
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/update-employee-access`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ employeeId: id, email: freed }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || json.message || 'Failed to release corporate email');
    }
    employeeService.clearCache();
    apiClient.notify();
    return true;
  },

  /**
   * Soft discharge: marks INACTIVE + termination_date, clears clock credential /
   * biometrics / team-shift links, frees corporate e-mail, purges timesheet
   * outside the employment window, and best-effort removes the employee from
   * the PrintPoint via WatchComm. Keeps the profile so historical espelho still
   * resolves the name.
   */
  async dischargeEmployee(id: string, terminationDate: string): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const list = await this.getEmployees();
    const emp = list.find(e => e.id === id);
    if (!emp) throw new Error('Employee not found');

    const term = terminationDate || new Date().toISOString().split('T')[0];
    const joiningDate = emp.joiningDate || null;

    const { error } = await supabase
      .from('profiles')
      .update({
        status: 'INACTIVE',
        termination_date: term,
        clock_biometric_registered: false,
        clock_credential: null,
        clock_onboarding_status: 'NOT_APPLICABLE',
        // Detach from live org graph so demitidos leave active team/shift filters.
        team_id: null,
        shift_id: null,
        line_manager_id: null,
        updated: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;

    employeeService.clearCache();

    try {
      await this.releaseCorporateEmail(id, emp.email);
    } catch (e) {
      console.warn('[EmployeeService] release email on discharge failed:', e);
    }

    try {
      const { timesheetService } = await import('./timesheet.service');
      await timesheetService.closeEmploymentWindow(id, { joiningDate, terminationDate: term });
    } catch (e) {
      console.warn('[EmployeeService] closeEmploymentWindow on discharge failed:', e);
    }

    if (needsClockAdmission(emp) && emp.employeeId) {
      try {
        const { clockCommandService } = await import('./clockCommand.service');
        await clockCommandService.run('remove-employee', { pis: emp.employeeId });
      } catch (e) {
        console.warn('[EmployeeService] WatchComm remove-employee on discharge failed:', e);
      }
    }

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
