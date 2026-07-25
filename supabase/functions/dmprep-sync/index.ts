// OpenHR — Trigger manual DMPREP sync (employees + punches).
// Requires ADMIN/HR caller. Proxies to the local dmprep-sync HTTP control plane.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SyncScope = 'all' | 'punches' | 'employees' | 'export-employees' | 'export-employee-discharge' | 'send-masters' | 'clear-masters';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function decryptPassword(value: string): Promise<string> {
  const secret = Deno.env.get('CLOCK_SUPERVISOR_ENCRYPTION_KEY')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || secret.length < 16) throw new Error('CLOCK_SUPERVISOR_ENCRYPTION_KEY is not configured');
  const [ivEncoded, encryptedEncoded] = value.split('.');
  if (!ivEncoded || !encryptedEncoded) throw new Error('Invalid encrypted supervisor password');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt']);
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivEncoded) },
    key,
    base64ToBytes(encryptedEncoded),
  );
  return decoder.decode(clear);
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
    return jsonError(403, 'Only ADMIN or HR can trigger DMPREP sync');
  }

  const syncBaseUrl = Deno.env.get('DMPREP_SYNC_URL');
  const syncApiKey = Deno.env.get('DMPREP_SYNC_API_KEY');
  if (!syncBaseUrl || !syncApiKey) {
    return jsonError(503, 'DMPREP sync service is not configured on this deployment');
  }

  let scope: SyncScope = 'all';
  let profileIds: string[] | undefined;
  try {
    const body = await req.json();
    if (
      body?.scope === 'punches' ||
      body?.scope === 'employees' ||
      body?.scope === 'export-employees' ||
      body?.scope === 'export-employee-discharge' ||
      body?.scope === 'send-masters' ||
      body?.scope === 'clear-masters' ||
      body?.scope === 'all'
    ) {
      scope = body.scope;
    }
    if (Array.isArray(body?.profileIds)) {
      profileIds = body.profileIds.filter((id: unknown) => typeof id === 'string');
    }
  } catch {
    // default all
  }

  const isMasterCommand = scope === 'send-masters' || scope === 'clear-masters';
  if (isMasterCommand && callerProfile.role !== 'ADMIN') {
    return jsonError(403, 'Only organization ADMIN can change clock supervisors');
  }

  let masters: Array<Record<string, unknown>> | undefined;
  try {
    if (scope === 'send-masters') {
      const { data: rows, error: supervisorsError } = await adminClient
        .from('clock_supervisors')
        .select('code, pis, password_ciphertext, has_technical_permission, has_datetime_permission, has_pendrive_permission, has_bobbin_permission')
        .eq('organization_id', callerProfile.organization_id)
        .eq('is_active', true)
        .order('created');
      if (supervisorsError) throw supervisorsError;
      if (!rows?.length) return jsonError(400, 'No active clock supervisors registered');
      if (rows.length > 5) return jsonError(409, 'Clock supervisor active limit exceeded');
      masters = await Promise.all(rows.map(async (row) => ({
        code: row.code,
        pis: row.pis,
        password: await decryptPassword(row.password_ciphertext),
        hasTechnicalPermission: row.has_technical_permission,
        hasDatetimePermission: row.has_datetime_permission,
        hasPendrivePermission: row.has_pendrive_permission,
        hasBobbinPermission: row.has_bobbin_permission,
      })));
    }

    const response = await fetch(`${syncBaseUrl.replace(/\/$/, '')}/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dmprep-sync-key': syncApiKey,
      },
      body: JSON.stringify({ scope, profileIds, ...(masters ? { masters } : {}) }),
      signal: AbortSignal.timeout(Number(Deno.env.get('DMPREP_SYNC_TIMEOUT_MS') ?? '120000')),
    });

    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: text.slice(0, 500) };
    }

    if (!response.ok) {
      if (isMasterCommand) {
        await adminClient.from('clock_supervisor_command_log').insert({
          organization_id: callerProfile.organization_id,
          action: scope === 'send-masters' ? 'SEND' : 'CLEAR',
          status: 'ERROR',
          supervisor_count: masters?.length ?? 0,
          performed_by: caller.id,
          error_message: String(payload.error ?? 'WatchComm command failed').slice(0, 500),
        });
      }
      return new Response(JSON.stringify(payload), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (isMasterCommand) {
      await adminClient.from('clock_supervisor_command_log').insert({
        organization_id: callerProfile.organization_id,
        action: scope === 'send-masters' ? 'SEND' : 'CLEAR',
        status: 'SUCCESS',
        supervisor_count: masters?.length ?? 0,
        performed_by: caller.id,
      });
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[DMPREP-SYNC] Proxy failed:', error);
    if (isMasterCommand) {
      await adminClient.from('clock_supervisor_command_log').insert({
        organization_id: callerProfile.organization_id,
        action: scope === 'send-masters' ? 'SEND' : 'CLEAR',
        status: 'ERROR',
        supervisor_count: masters?.length ?? 0,
        performed_by: caller.id,
        error_message: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      });
    }
    return jsonError(
      502,
      'Could not reach the DMPREP sync service. Ensure dmprep-sync is running on the server.',
    );
  }
});

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
