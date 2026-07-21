// OpenHR — Trigger manual DMPREP sync (employees + punches).
// Requires ADMIN/HR caller. Proxies to the local dmprep-sync HTTP control plane.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SyncScope = 'all' | 'punches' | 'employees';

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
  try {
    const body = await req.json();
    if (body?.scope === 'punches' || body?.scope === 'employees' || body?.scope === 'all') {
      scope = body.scope;
    }
  } catch {
    // default all
  }

  try {
    const response = await fetch(`${syncBaseUrl.replace(/\/$/, '')}/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dmprep-sync-key': syncApiKey,
      },
      body: JSON.stringify({ scope }),
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
      return new Response(JSON.stringify(payload), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[DMPREP-SYNC] Proxy failed:', error);
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
