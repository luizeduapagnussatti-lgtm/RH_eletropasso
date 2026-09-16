// OpenHR — Claim employee access (first login by CPF)
// Public edge: no user JWT. Uses service role only on the server.
// Steps: lookup (CPF → first name) then claim (email + password).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PUNCHING_ROLES = new Set(['EMPLOYEE', 'MANAGER', 'TEAM_LEAD']);
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 12;

type RateBucket = { count: number; resetAt: number };
const rateByIp = new Map<string, RateBucket>();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function checkRate(ip: string): boolean {
  const now = Date.now();
  const bucket = rateByIp.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateByIp.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_MAX) return false;
  bucket.count += 1;
  return true;
}

function normalizeCpf(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

function validateCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
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

function firstNameOf(name: string): string {
  const part = String(name || '').trim().split(/\s+/)[0] || '';
  return part;
}

function namesMatch(a: string, b: string): boolean {
  return firstNameOf(a).localeCompare(firstNameOf(b), 'pt-BR', { sensitivity: 'accent' }) === 0;
}

function isPlaceholderEmail(email: string): boolean {
  const e = String(email || '').toLowerCase();
  return (
    e.endsWith('@import.eletropasso.local') ||
    e.endsWith('@inactive.eletropasso.local') ||
    e.endsWith('@eletropasso.local')
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed', code: 'METHOD' });
  }

  const ip = clientIp(req);
  if (!checkRate(ip)) {
    return json(429, { error: 'Too many attempts. Try again later.', code: 'RATE_LIMIT' });
  }

  let body: {
    action?: string;
    cpf?: string;
    confirmFirstName?: string;
    email?: string;
    password?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON', code: 'BAD_JSON' });
  }

  const action = String(body.action || 'lookup').toLowerCase();
  const cpf = normalizeCpf(body.cpf || '');
  if (!validateCpf(cpf)) {
    return json(400, { error: 'Invalid CPF', code: 'CPF_INVALID' });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, name, email, role, status, employment_type, first_access_at, organization_id, verified')
    .eq('cpf', cpf)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  // Generic miss — do not reveal whether CPF exists in other states
  if (profileErr || !profile) {
    return json(404, { error: 'Unable to start first access with this CPF.', code: 'NOT_FOUND' });
  }

  const role = String(profile.role || '').toUpperCase();
  const employmentType = String(profile.employment_type || '').toUpperCase();
  const isPj = employmentType === 'CONTRACTOR' || employmentType === 'PJ';
  if (!PUNCHING_ROLES.has(role) || isPj) {
    return json(403, { error: 'Unable to start first access with this CPF.', code: 'NOT_ELIGIBLE' });
  }

  if (profile.first_access_at) {
    return json(409, {
      error: 'Access already claimed. Ask HR to reset your password.',
      code: 'ALREADY_CLAIMED',
    });
  }

  const firstName = firstNameOf(profile.name);

  if (action === 'lookup') {
    return json(200, {
      ok: true,
      firstName,
      hasPlaceholderEmail: isPlaceholderEmail(String(profile.email || '')),
    });
  }

  if (action !== 'claim') {
    return json(400, { error: 'Unknown action', code: 'BAD_ACTION' });
  }

  const confirmFirstName = String(body.confirmFirstName || '').trim();
  if (!confirmFirstName || !namesMatch(confirmFirstName, firstName)) {
    return json(400, { error: 'Name confirmation failed.', code: 'NAME_MISMATCH' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'Invalid email', code: 'EMAIL_INVALID' });
  }
  if (isPlaceholderEmail(email)) {
    return json(400, { error: 'Use your real email address.', code: 'EMAIL_PLACEHOLDER' });
  }
  if (password.length < 8) {
    return json(400, { error: 'Password must have at least 8 characters', code: 'PASSWORD_SHORT' });
  }

  // Email conflict with another ACTIVE profile
  {
    const { data: conflict } = await admin
      .from('profiles')
      .select('id, status')
      .ilike('email', email)
      .neq('id', profile.id)
      .maybeSingle();
    if (conflict) {
      if (conflict.status === 'INACTIVE') {
        const freed = `released.${String(conflict.id).replace(/-/g, '')}@inactive.eletropasso.local`;
        const { error: freeAuthErr } = await admin.auth.admin.updateUserById(conflict.id, {
          email: freed,
          email_confirm: true,
        });
        if (freeAuthErr) {
          return json(409, { error: 'Email still locked on a discharged account.', code: 'EMAIL_LOCKED' });
        }
        await admin
          .from('profiles')
          .update({ email: freed, updated: new Date().toISOString() })
          .eq('id', conflict.id);
      } else {
        return json(409, { error: 'Email already in use.', code: 'EMAIL_IN_USE' });
      }
    }
  }

  const now = new Date().toISOString();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const confirmRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${profile.id}`, {
    method: 'PUT',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: profile.name },
    }),
  });
  if (!confirmRes.ok) {
    const errBody = await confirmRes.text().catch(() => '');
    return json(400, { error: errBody || 'Failed to update login', code: 'AUTH_UPDATE' });
  }

  const { error: updErr } = await admin
    .from('profiles')
    .update({
      email,
      verified: true,
      first_access_at: now,
      updated: now,
    })
    .eq('id', profile.id);

  if (updErr) {
    return json(500, { error: updErr.message || 'Failed to update profile', code: 'PROFILE_UPDATE' });
  }

  return json(200, { ok: true, email });
});
