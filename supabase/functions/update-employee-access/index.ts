// OpenHR — Update employee login (email / password) via service role.
// Requires ADMIN or HR caller. Updates auth.users + profiles.email.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Missing Authorization header' });

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user: caller }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !caller) return json(401, { error: 'Invalid token' });

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: callerProfile, error: profileErr } = await adminClient
    .from('profiles')
    .select('role, organization_id')
    .eq('id', caller.id)
    .single();

  if (profileErr || !callerProfile) return json(403, { error: 'Caller profile not found' });
  if (!['ADMIN', 'HR', 'SUPER_ADMIN'].includes(callerProfile.role)) {
    return json(403, { error: 'Only ADMIN or HR can update employee login' });
  }

  let body: { employeeId?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const employeeId = String(body.employeeId ?? '').trim();
  const email = body.email ? String(body.email).trim().toLowerCase() : '';
  const password = body.password ? String(body.password) : '';

  if (!employeeId) return json(400, { error: 'employeeId is required' });
  if (!email && !password) return json(400, { error: 'Provide email and/or password' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'Invalid email format' });
  }
  if (password && password.length < 8) {
    return json(400, { error: 'Password must have at least 8 characters' });
  }

  const { data: target, error: targetErr } = await adminClient
    .from('profiles')
    .select('id, email, role, organization_id')
    .eq('id', employeeId)
    .single();

  if (targetErr || !target) return json(404, { error: 'Employee not found' });

  if (
    callerProfile.role !== 'SUPER_ADMIN' &&
    target.organization_id !== callerProfile.organization_id
  ) {
    return json(403, { error: 'Employee is outside your organization' });
  }

  // HR cannot change ADMIN login credentials
  if (callerProfile.role === 'HR' && (target.role === 'ADMIN' || target.role === 'SUPER_ADMIN')) {
    return json(403, { error: 'HR cannot change Administrator login' });
  }

  if (email && email !== String(target.email || '').toLowerCase()) {
    const { data: conflict } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .neq('id', employeeId)
      .maybeSingle();
    if (conflict) return json(409, { error: 'Email already in use by another account' });
  }

  try {
    const authPatch: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (email) {
      authPatch.email = email;
      authPatch.email_confirm = true;
    }
    if (password) authPatch.password = password;

    const { error: authUpdateErr } = await adminClient.auth.admin.updateUserById(
      employeeId,
      authPatch,
    );
    if (authUpdateErr) {
      const msg = authUpdateErr.message || 'Failed to update auth user';
      if (/already|registered|exists/i.test(msg)) {
        return json(409, { error: 'Email already registered in authentication' });
      }
      return json(400, { error: msg });
    }

    if (email) {
      const { error: profileUpdateErr } = await adminClient
        .from('profiles')
        .update({ email, updated: new Date().toISOString() })
        .eq('id', employeeId);
      if (profileUpdateErr) {
        return json(500, { error: profileUpdateErr.message });
      }
    }

    return json(200, {
      success: true,
      employeeId,
      emailUpdated: Boolean(email),
      passwordUpdated: Boolean(password),
    });
  } catch (error) {
    console.error('[UPDATE-EMPLOYEE-ACCESS]', error);
    return json(500, {
      error: error instanceof Error ? error.message : 'Internal error',
    });
  }
});
