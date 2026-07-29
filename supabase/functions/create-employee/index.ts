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

function resolveClockCredential(clockCredential: string, pis: string): string {
  return normalizeClockCredential(clockCredential) || normalizePis(pis);
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

function initialClockStatus(role: string): string {
  return PUNCHING_ROLES.has(role.toUpperCase()) ? 'PENDING_EXPORT' : 'NOT_APPLICABLE';
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
    const clockCredentialRaw = formData.get('clockCredential')?.toString()?.trim() ?? '';
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
    if (PUNCHING_ROLES.has(role)) {
      if (!employeeIdRaw || !validatePis(employeeIdRaw)) {
        return jsonError(400, 'Invalid or missing PIS (11–12 digits) for clock-in roles');
      }
    }
    const clockCredential = resolveClockCredential(clockCredentialRaw, employeeId);

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

    if (clockCredential) {
      const { data: dupCred } = await adminClient
        .from('profiles')
        .select('id')
        .eq('organization_id', orgId)
        .eq('clock_credential', clockCredential)
        .maybeSingle();
      if (dupCred) {
        return jsonError(409, 'Clock credential already registered for another employee in this organization');
      }
    }

    const { data: authData, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { name },
    });

    if (createErr || !authData.user) {
      return jsonError(400, 'Failed to create user: ' + createErr?.message);
    }

    await adminClient.auth.resend({ type: 'signup', email });

    const userId = authData.user.id;

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

    const clockStatus = initialClockStatus(role);
    const now = new Date().toISOString();

    const { error: profileInsertErr } = await adminClient.from('profiles').upsert({
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
    }, { onConflict: 'id' });

    if (profileInsertErr) {
      await adminClient.auth.admin.deleteUser(userId);
      return jsonError(400, 'Failed to create profile: ' + profileInsertErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, userId, clockOnboardingStatus: clockStatus }),
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
