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

function isPlaceholderEmail(email: string): boolean {
  const e = String(email || '').trim().toLowerCase();
  return (
    e.endsWith('@import.eletropasso.local') ||
    e.endsWith('@inactive.eletropasso.local') ||
    e.endsWith('@eletropasso.loja')
  );
}

function gotrueErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const row = payload as Record<string, unknown>;
  return String(row.msg || row.message || row.error_description || row.error || fallback);
}

/** Admin REST — avoids unpinned supabase-js GoTrueAdminApi gaps (updateUserById missing). */
async function gotrueAdminUser(
  method: 'POST' | 'PUT',
  userId: string | null,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; error?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const path = method === 'POST' ? '/auth/v1/admin/users' : `/auth/v1/admin/users/${userId}`;
  const res = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    data = { msg: text };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, data, error: gotrueErrorMessage(data, text || res.statusText) };
  }
  return { ok: true, status: res.status, data };
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
    return json(400, { error: 'Password must have at least 8 characters', code: 'PASSWORD_SHORT' });
  }
  if (email && isPlaceholderEmail(email)) {
    return json(400, {
      error: 'Use a real login email, not an import/technical address.',
      code: 'PLACEHOLDER_EMAIL',
    });
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
    return json(403, { error: 'HR cannot change Administrator login', code: 'ACCESS_FORBIDDEN' });
  }

  const nextLoginEmail = email || String(target.email || '').trim().toLowerCase();
  if (password && isPlaceholderEmail(nextLoginEmail)) {
    return json(400, {
      error: 'Replace the import/technical email with a real login email before setting a password.',
      code: 'PLACEHOLDER_EMAIL',
    });
  }

  if (email && email !== String(target.email || '').toLowerCase()) {
    const { data: conflict } = await adminClient
      .from('profiles')
      .select('id, status')
      .ilike('email', email)
      .neq('id', employeeId)
      .maybeSingle();
    if (conflict) {
      if (conflict.status === 'INACTIVE') {
        const freed = `released.${String(conflict.id).replace(/-/g, '')}@inactive.eletropasso.local`;
        const freeAuth = await gotrueAdminUser('PUT', conflict.id, {
          email: freed,
          email_confirm: true,
        });
        if (!freeAuth.ok) {
          return json(409, {
            error: 'Email still locked on a discharged account: ' + (freeAuth.error || ''),
            code: 'EMAIL_LOCKED_DISCHARGED',
          });
        }
        await adminClient
          .from('profiles')
          .update({ email: freed, updated: new Date().toISOString() })
          .eq('id', conflict.id);
      } else {
        return json(409, { error: 'Email already in use by another account' });
      }
    }
  }

  try {
    const authPatch: Record<string, unknown> = { email_confirm: true };
    if (email) authPatch.email = email;
    if (password) authPatch.password = password;

    let applied = await gotrueAdminUser('PUT', employeeId, authPatch);
    if (!applied.ok && (applied.status === 404 || /not found|user not found/i.test(applied.error || ''))) {
      if (!nextLoginEmail || isPlaceholderEmail(nextLoginEmail) || !password) {
        return json(400, {
          error: applied.error || 'Auth user not found. Set a real email and password together.',
          code: 'AUTH_UPDATE',
        });
      }
      applied = await gotrueAdminUser('POST', null, {
        id: employeeId,
        email: nextLoginEmail,
        password,
        email_confirm: true,
      });
    }

    if (!applied.ok) {
      const msg = applied.error || 'Failed to update auth user';
      if (/already|registered|exists/i.test(msg) && email) {
        const { data: listed } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const holder = (listed?.users || []).find(
          (u) => String(u.email || '').toLowerCase() === email && u.id !== employeeId,
        );
        if (holder) {
          const { data: holderProfile } = await adminClient
            .from('profiles')
            .select('id, status')
            .eq('id', holder.id)
            .maybeSingle();
          if (holderProfile && holderProfile.status !== 'INACTIVE') {
            return json(409, { error: 'Email already registered in authentication', code: 'EMAIL_AUTH_CONFLICT' });
          }
          const freed = `released.${String(holder.id).replace(/-/g, '')}@inactive.eletropasso.local`;
          if (holderProfile?.status === 'INACTIVE') {
            await gotrueAdminUser('PUT', holder.id, { email: freed, email_confirm: true });
            await adminClient
              .from('profiles')
              .update({ email: freed, updated: new Date().toISOString() })
              .eq('id', holder.id);
          } else {
            await adminClient.auth.admin.deleteUser(holder.id);
          }
          applied = await gotrueAdminUser('PUT', employeeId, authPatch);
          if (!applied.ok) {
            return json(409, { error: 'Email already registered in authentication', code: 'EMAIL_AUTH_CONFLICT' });
          }
        } else {
          return json(409, { error: 'Email already registered in authentication', code: 'EMAIL_AUTH_CONFLICT' });
        }
      } else {
        return json(400, { error: msg, code: 'AUTH_UPDATE' });
      }
    }

    const now = new Date().toISOString();
    const profilePatch: Record<string, unknown> = {
      verified: true,
      updated: now,
    };
    if (email) profilePatch.email = email;
    if (password) profilePatch.first_access_at = now;

    const { error: profileUpdateErr } = await adminClient
      .from('profiles')
      .update(profilePatch)
      .eq('id', employeeId);
    if (profileUpdateErr) {
      return json(500, { error: profileUpdateErr.message, code: 'PROFILE_UPDATE' });
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
      code: 'INTERNAL',
    });
  }
});
