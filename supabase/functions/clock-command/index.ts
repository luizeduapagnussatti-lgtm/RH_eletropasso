// OpenHR — Generic PrintPoint WatchComm command proxy.
// ADMIN-only. Proxies to dmprep-sync scope=clock-command and audits every call.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWLIST = new Set([
  'status',
  'identity',
  'employer-read',
  'employee-list-read',
  'fingerprint-list-read',
  'set-datetime',
  'set-dst',
  'remove-dst',
  'include-holidays',
  'send-display-message',
  'clear-display-message',
  'send-employees',
  'remove-employee',
  'exclude-fingerprint',
  'exclude-fingerprint-orphans',
  'program-biometric-reader-use',
  'program-trigger-type',
  'update-communication-user',
  'set-net-info',
  'change-employer',
]);

const DENYLIST = new Set([
  'UpdateFirmware',
  'ActivateBootLoader',
  'EraseMarkingPoints',
  'ReplaceMRP',
  'ClearAllRegisters',
  'CleanEssentialVariables',
  'ExchangeSealREP',
]);

const SENSITIVE_OPS = new Set([
  'set-net-info',
  'change-employer',
  'update-communication-user',
]);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function summarizePayload(op: string, payload: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = { op };
  if (Array.isArray(payload.employees)) summary.employeeCount = payload.employees.length;
  if (typeof payload.pis === 'string') summary.pis = payload.pis;
  if (typeof payload.message === 'string') summary.messageLength = payload.message.length;
  if (typeof payload.isoDateTime === 'string') summary.isoDateTime = payload.isoDateTime;
  if (Array.isArray(payload.dates)) summary.holidayCount = payload.dates.length;
  if (SENSITIVE_OPS.has(op)) {
    summary.redacted = true;
    if (typeof payload.ip === 'string') summary.hasIp = true;
    if (typeof payload.cnpj === 'string') summary.hasCnpj = true;
  }
  return summary;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method === 'GET') {
    // List recent audit log for the caller's org
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
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller.id)
      .single();
    if (!profile || !['ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
      return json(403, { error: 'Only organization ADMIN can view clock command log' });
    }

    const { data, error } = await adminClient
      .from('clock_command_log')
      .select('id, operation, status, payload_summary, result, performed_by, error_message, created')
      .eq('organization_id', profile.organization_id)
      .order('created', { ascending: false })
      .limit(50);
    if (error) return json(500, { error: error.message });

    return json(200, {
      commands: (data ?? []).map((row) => ({
        id: row.id,
        operation: row.operation,
        status: row.status,
        payloadSummary: row.payload_summary,
        result: row.result,
        performedBy: row.performed_by ?? undefined,
        errorMessage: row.error_message ?? undefined,
        created: row.created,
      })),
    });
  }

  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

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
  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('role, organization_id')
    .eq('id', caller.id)
    .single();
  if (profileErr || !profile) return json(403, { error: 'Caller profile not found' });
  if (!['ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
    return json(403, { error: 'Only organization ADMIN can run clock commands' });
  }

  let op = '';
  let payload: Record<string, unknown> = {};
  try {
    const body = await req.json() as { op?: string; payload?: Record<string, unknown> };
    op = String(body.op ?? '').trim();
    payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  if (!ALLOWLIST.has(op) || DENYLIST.has(op)) {
    return json(400, { error: `Clock command not allowed: ${op || '(empty)'}` });
  }

  const syncBaseUrl = Deno.env.get('DMPREP_SYNC_URL');
  const syncApiKey = Deno.env.get('DMPREP_SYNC_API_KEY');
  if (!syncBaseUrl || !syncApiKey) {
    return json(503, { error: 'DMPREP sync service is not configured on this deployment' });
  }

  const payloadSummary = summarizePayload(op, payload);
  try {
    const response = await fetch(`${syncBaseUrl.replace(/\/$/, '')}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dmprep-sync-key': syncApiKey,
      },
      body: JSON.stringify({
        scope: 'clock-command',
        command: { op, payload },
      }),
    });

    const text = await response.text();
    let syncPayload: Record<string, unknown> = {};
    try {
      syncPayload = text ? JSON.parse(text) : {};
    } catch {
      syncPayload = { error: text.slice(0, 500) };
    }

    if (!response.ok) {
      await adminClient.from('clock_command_log').insert({
        organization_id: profile.organization_id,
        operation: op,
        status: 'ERROR',
        payload_summary: payloadSummary,
        performed_by: caller.id,
        error_message: String(syncPayload.error ?? 'WatchComm command failed').slice(0, 500),
      });
      return json(response.status, syncPayload);
    }

    const commandResult = (syncPayload.command ?? syncPayload) as Record<string, unknown>;
    await adminClient.from('clock_command_log').insert({
      organization_id: profile.organization_id,
      operation: op,
      status: 'SUCCESS',
      payload_summary: payloadSummary,
      result: commandResult,
      performed_by: caller.id,
    });

    return json(200, { success: true, op, command: commandResult });
  } catch (error) {
    console.error('[CLOCK-COMMAND] Proxy failed:', error);
    await adminClient.from('clock_command_log').insert({
      organization_id: profile.organization_id,
      operation: op,
      status: 'ERROR',
      payload_summary: payloadSummary,
      performed_by: caller.id,
      error_message: (error instanceof Error ? error.message : String(error)).slice(0, 500),
    });
    return json(502, {
      error: 'Could not reach the DMPREP sync service. Ensure dmprep-sync is running on the server.',
    });
  }
});
