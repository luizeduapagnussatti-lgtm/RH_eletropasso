// OpenHR — Create Employee Edge Function
// Requires ADMIN or HR caller. Uses service role to create auth.users + profile.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUNCHING_ROLES = new Set(['EMPLOYEE', 'MANAGER', 'TEAM_LEAD']);

function normalizePis(value: string): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? digits.padStart(12, '0') : '';
}

function validatePis(value: string): boolean {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 11 && digits.length <= 12 && /^\d+$/.test(digits);
}

function normalizeClockCredential(value: string): string {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length > 12) digits = digits.slice(-12);
  return digits.padStart(12, '0');
}

const SHORT_CLOCK_CREDENTIAL_MAX_DIGITS = 6;

function clockCredentialSignificantDigits(value: string): string {
  const n = normalizeClockCredential(value);
  if (!n) return '';
  return n.replace(/^0+/, '') || '0';
}

function isShortClockCredential(value: string): boolean {
  const sig = clockCredentialSignificantDigits(value);
  return !!sig && sig.length <= SHORT_CLOCK_CREDENTIAL_MAX_DIGITS;
}

function allocateNextClockCredential(existing: Array<string | null | undefined>): string {
  const used = new Set<string>();
  let max = 0;
  for (const raw of existing) {
    const normalized = normalizeClockCredential(String(raw ?? ''));
    if (!normalized) continue;
    used.add(normalized);
    if (!isShortClockCredential(normalized)) continue;
    const n = parseInt(clockCredentialSignificantDigits(normalized), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  let next = max + 1;
  let padded = normalizeClockCredential(String(next));
  while (used.has(padded)) {
    next += 1;
    padded = normalizeClockCredential(String(next));
  }
  return padded;
}

function isClockCredentialUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '23505' && /clock_credential/i.test(err.message || '')) return true;
  return /duplicate key.*clock_credential/i.test(err.message || '');
}

function normalizeCpf(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

function validateCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (!cpf) return true;
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10], 10);
}

function requiresClockAdmission(role: string, employmentType: string): boolean {
  return PUNCHING_ROLES.has(role.toUpperCase()) && employmentType.toUpperCase() !== 'PJ';
}

function initialClockStatus(role: string, employmentType: string): string {
  return requiresClockAdmission(role, employmentType) ? 'PENDING_EXPORT' : 'NOT_APPLICABLE';
}

function normalizePhoneE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.length >= 12 ? digits : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed');
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonError(401, 'Missing Authorization header');

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user: caller }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !caller) return jsonError(401, 'Invalid token');

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: callerProfile, error: profileErr } = await adminClient
    .from('profiles')
    .select('role, organization_id')
    .eq('id', caller.id)
    .single();

  if (profileErr || !callerProfile) return jsonError(403, 'Caller profile not found');
  if (!['ADMIN', 'HR', 'SUPER_ADMIN'].includes(callerProfile.role)) {
    return jsonError(403, 'Only ADMIN or HR can create employees');
  }

  try {
    const formData = await req.formData();
    const email       = formData.get('email')?.toString()?.trim().toLowerCase() ?? '';
    const password    = formData.get('password')?.toString() ?? '';
    const name        = formData.get('name')?.toString()?.trim() ?? '';
    const role        = (formData.get('role')?.toString() ?? 'EMPLOYEE').toUpperCase();
    const department  = formData.get('department')?.toString()?.trim() ?? '';
    const designation = formData.get('designation')?.toString()?.trim() ?? '';
    const employeeIdRaw = formData.get('employeeId')?.toString()?.trim() ?? '';
    const lineManagerId = formData.get('lineManagerId')?.toString()?.trim() || null;
    const teamId      = formData.get('teamId')?.toString()?.trim() || null;
    const shiftId     = formData.get('shiftId')?.toString()?.trim() || null;
    const mobile      = formData.get('mobile')?.toString()?.trim() ?? '';
    const whatsappOptIn = (formData.get('whatsappOptIn')?.toString() ?? '').toLowerCase() === 'true';
    let messagingChannelPref: string[] = ['APP', 'EMAIL'];
    try {
      const prefRaw = formData.get('messagingChannelPref')?.toString();
      if (prefRaw) messagingChannelPref = JSON.parse(prefRaw);
    } catch { /* default */ }
    const whatsappE164 = normalizePhoneE164(mobile);
    const joiningDate = formData.get('joiningDate')?.toString()?.trim() || null;
    const employmentType = formData.get('employmentType')?.toString()?.trim() || 'PERMANENT';
    const workType    = formData.get('workType')?.toString()?.trim() || 'OFFICE';
    const location    = formData.get('location')?.toString()?.trim() ?? '';
    const emergencyContact = formData.get('emergencyContact')?.toString()?.trim() ?? '';
    const cpfRaw      = formData.get('cpf')?.toString()?.trim() ?? '';
    const status      = formData.get('status')?.toString()?.trim() || 'ACTIVE';
    const clockBiometricRegistered =
      (formData.get('clockBiometricRegistered')?.toString() ?? '').toLowerCase() === 'true';
    const avatarFile  = formData.get('avatar') instanceof File ? formData.get('avatar') as File : null;

    if (!email || !password || !name) {
      return jsonError(400, 'Missing required fields: email, password, name');
    }
    if (password.length < 8) {
      return jsonError(400, 'Password must be at least 8 characters');
    }

    const employeeId = normalizePis(employeeIdRaw);
    if (requiresClockAdmission(role, employmentType)) {
      if (!employeeIdRaw || !validatePis(employeeIdRaw)) {
        return jsonError(400, 'Invalid or missing PIS (11–12 digits) for clock-in roles');
      }
    }

    const cpf = normalizeCpf(cpfRaw);
    if (cpf && !validateCpf(cpfRaw)) {
      return jsonError(400, 'Invalid CPF');
    }

    const orgId = callerProfile.organization_id;

    if (employeeId) {
      const { data: dup } = await adminClient
        .from('profiles')
        .select('id')
        .eq('organization_id', orgId)
        .eq('employee_id', employeeId)
        .maybeSingle();
      if (dup) {
        return jsonError(409, 'PIS already registered for another employee in this organization');
      }
    }

    async function allocateClockCredentialForOrg(): Promise<string> {
      // Include ACTIVE + INACTIVE — credentials are never cleared on discharge.
      const { data: credRows, error: credErr } = await adminClient
        .from('profiles')
        .select('clock_credential')
        .eq('organization_id', orgId)
        .not('clock_credential', 'is', null);
      if (credErr) {
        throw new Error('Failed to list clock credentials: ' + credErr.message);
      }
      return allocateNextClockCredential(
        (credRows || []).map((r: { clock_credential?: string | null }) => r.clock_credential)
      );
    }

    let clockCredential: string | null = null;
    if (requiresClockAdmission(role, employmentType)) {
      clockCredential = await allocateClockCredentialForOrg();
    }
    // PJ / non-punching roles: never store a clock credential (PIS is separate).

    // Free corporate email held by a soft-discharged (INACTIVE) account so it
    // can be reassigned (e.g. financeiro@ after a demissão).
    {
      const { data: emailHolder } = await adminClient
        .from('profiles')
        .select('id, status, email, organization_id')
        .ilike('email', email)
        .maybeSingle();
      if (emailHolder) {
        if (emailHolder.status === 'INACTIVE') {
          const freed = `released.${String(emailHolder.id).replace(/-/g, '')}@inactive.eletropasso.local`;
          const { error: freeAuthErr } = await adminClient.auth.admin.updateUserById(emailHolder.id, {
            email: freed,
            email_confirm: true,
          });
          if (freeAuthErr) {
            return jsonError(409, 'Email still locked on a discharged account: ' + freeAuthErr.message);
          }
          await adminClient
            .from('profiles')
            .update({ email: freed, updated: new Date().toISOString() })
            .eq('id', emailHolder.id);
        } else if (emailHolder.organization_id === orgId) {
          return jsonError(409, 'Email already registered for another active employee');
        }
      }
    }

    const firstCreate = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { name },
    });
    let createdUser = firstCreate.data?.user ?? null;

    if (firstCreate.error || !createdUser) {
      const msg = firstCreate.error?.message || 'unknown';
      if (/already|registered|exists/i.test(msg)) {
        const { data: listed } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const holder = (listed?.users || []).find(
          (u) => String(u.email || '').toLowerCase() === email,
        );
        if (!holder) {
          return jsonError(400, 'Failed to create user: ' + msg);
        }
        const { data: holderProfile } = await adminClient
          .from('profiles')
          .select('id, status')
          .eq('id', holder.id)
          .maybeSingle();
        if (holderProfile && holderProfile.status !== 'INACTIVE') {
          return jsonError(409, 'Email already registered for another active employee');
        }
        if (holderProfile?.status === 'INACTIVE') {
          const freed = `released.${String(holder.id).replace(/-/g, '')}@inactive.eletropasso.local`;
          await adminClient.auth.admin.updateUserById(holder.id, {
            email: freed,
            email_confirm: true,
          });
          await adminClient
            .from('profiles')
            .update({ email: freed, updated: new Date().toISOString() })
            .eq('id', holder.id);
        } else {
          await adminClient.auth.admin.deleteUser(holder.id);
        }
        const retry = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: false,
          user_metadata: { name },
        });
        if (retry.error || !retry.data.user) {
          return jsonError(400, 'Failed to create user: ' + (retry.error?.message || msg));
        }
        createdUser = retry.data.user;
      } else {
        return jsonError(400, 'Failed to create user: ' + msg);
      }
    }

    // Best-effort confirmation e-mail — never block / hang employee creation.
    try {
      await Promise.race([
        adminClient.auth.resend({ type: 'signup', email }),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch (e) {
      console.warn('[CREATE-EMPLOYEE] resend signup skipped:', e);
    }

    const userId = createdUser.id;

    let avatarPath: string | null = null;
    if (avatarFile && avatarFile.size > 0) {
      try {
        const path = `${userId}/avatar.webp`;
        const { error: uploadErr } = await adminClient.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true, contentType: 'image/webp' });
        if (!uploadErr) avatarPath = path;
      } catch (e) {
        console.warn('[CREATE-EMPLOYEE] Avatar upload failed (non-fatal):', e);
      }
    }

    const clockStatus = initialClockStatus(role, employmentType);
    const now = new Date().toISOString();

    const profilePayload: Record<string, unknown> = {
      id:              userId,
      organization_id: orgId,
      name,
      email,
      role,
      employee_id:     employeeId || null,
      clock_credential: clockCredential || null,
      cpf:             cpf || null,
      department:      department || null,
      designation:     designation || null,
      line_manager_id: lineManagerId,
      team_id:         teamId,
      shift_id:        shiftId,
      mobile:          mobile || null,
      whatsapp_e164:   whatsappE164,
      whatsapp_opt_in: whatsappOptIn,
      messaging_channel_pref: messagingChannelPref,
      joining_date:    joiningDate,
      employment_type: employmentType,
      work_type:       workType,
      location:        location || null,
      emergency_contact: emergencyContact || null,
      status:          status,
      clock_onboarding_status: clockStatus,
      clock_onboarding_at: clockStatus === 'PENDING_EXPORT' ? now : null,
      clock_biometric_registered: clockBiometricRegistered,
      avatar:          avatarPath,
      verified:        false,
    };

    let profileInsertErr: { code?: string; message?: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await adminClient.from('profiles').upsert(profilePayload, { onConflict: 'id' });
      profileInsertErr = result.error;
      if (!profileInsertErr) break;
      if (
        !isClockCredentialUniqueViolation(profileInsertErr) ||
        !requiresClockAdmission(role, employmentType)
      ) {
        break;
      }
      clockCredential = await allocateClockCredentialForOrg();
      profilePayload.clock_credential = clockCredential;
    }

    if (profileInsertErr) {
      await adminClient.auth.admin.deleteUser(userId);
      return jsonError(400, 'Failed to create profile: ' + profileInsertErr.message);
    }

    // Enqueue PrintPoint sync — RH processes via Comunicação → Sincronização.
    if (requiresClockAdmission(role, employmentType) && employeeId && clockCredential) {
      try {
        const shortCred = clockCredentialSignificantDigits(clockCredential);
        await adminClient.from('hardware_sync_queue').insert({
          organization_id: orgId,
          command_type: 'ADD_EMPLOYEE',
          target_employee_id: userId,
          status: 'PENDING',
          payload: {
            pis: employeeId,
            name,
            credential: shortCred || clockCredential,
          },
          created_by: caller.id,
        });
      } catch (e) {
        console.warn('[CREATE-EMPLOYEE] Failed to enqueue ADD_EMPLOYEE (non-fatal):', e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        clockOnboardingStatus: clockStatus,
        clockCredential: clockCredential || null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[CREATE-EMPLOYEE] Unhandled error:', err);
    return jsonError(500, 'Internal Server Error: ' + (err as Error).message);
  }
});

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
