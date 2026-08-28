// OpenHR — PWA punch selfie storage cleanup
// Schedule: 0 2 * * * (daily 02:00 UTC)
//
// Deletes selfies bucket objects under */pwa-punches/* older than
// PWA_PUNCH_SELFIE_RETENTION_DAYS (90). Does NOT touch legacy
// {attendanceId}/selfie.webp or timesheet-signatures.
// After delete, removes selfiePath from punches.raw_payload for APP rows.
//
// Called by pg_cron via net.http_post() with Authorization: Bearer <CRON_SECRET>.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

/** Retention for APP punch selfies only (days). */
const PWA_PUNCH_SELFIE_RETENTION_DAYS = 90;
const BUCKET = 'selfies';
const PATH_FRAGMENT = '/pwa-punches/';
const BATCH_SIZE = 100;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - PWA_PUNCH_SELFIE_RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();

  console.log(
    `[cron-pwa-punch-selfie-cleanup] start retention=${PWA_PUNCH_SELFIE_RETENTION_DAYS}d cutoff=${cutoffIso}`,
  );

  const { data: objects, error: listErr } = await admin.rpc('list_old_pwa_punch_selfies', {
    p_cutoff: cutoffIso,
  });

  if (listErr) {
    console.error('[cron-pwa-punch-selfie-cleanup] list error:', listErr.message);
    return jsonResponse(500, { error: listErr.message });
  }

  const paths = (objects ?? [])
    .map((o: { name: string } | string) => (typeof o === 'string' ? o : o.name))
    .filter((name: string) => typeof name === 'string' && name.includes(PATH_FRAGMENT));

  if (paths.length === 0) {
    console.log('[cron-pwa-punch-selfie-cleanup] nothing to delete');
    return jsonResponse(200, {
      ok: true,
      retentionDays: PWA_PUNCH_SELFIE_RETENTION_DAYS,
      deletedFiles: 0,
      clearedPunchPaths: 0,
    });
  }

  let deletedFiles = 0;
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE);
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(batch);
    if (rmErr) {
      console.error('[cron-pwa-punch-selfie-cleanup] remove error:', rmErr.message, batch.length);
      return jsonResponse(500, {
        error: rmErr.message,
        deletedFiles,
        attempted: batch.length,
      });
    }
    deletedFiles += batch.length;
  }

  const pathSet = new Set(paths);
  const { data: appPunches, error: punchErr } = await admin
    .from('punches')
    .select('id, raw_payload')
    .eq('source', 'APP')
    .not('raw_payload', 'is', null)
    .limit(5000);

  if (punchErr) {
    console.error('[cron-pwa-punch-selfie-cleanup] punches select error:', punchErr.message);
    return jsonResponse(500, { error: punchErr.message, deletedFiles });
  }

  let clearedPunchPaths = 0;
  for (const row of appPunches ?? []) {
    const raw = (row.raw_payload ?? {}) as Record<string, unknown>;
    const selfiePath = raw.selfiePath;
    if (typeof selfiePath !== 'string' || !pathSet.has(selfiePath)) continue;
    const next = { ...raw };
    delete next.selfiePath;
    const { error: upErr } = await admin
      .from('punches')
      .update({ raw_payload: next })
      .eq('id', row.id);
    if (upErr) {
      console.error('[cron-pwa-punch-selfie-cleanup] punch update error:', upErr.message, row.id);
      continue;
    }
    clearedPunchPaths++;
  }

  console.log(
    `[cron-pwa-punch-selfie-cleanup] done deletedFiles=${deletedFiles} clearedPunchPaths=${clearedPunchPaths}`,
  );

  return jsonResponse(200, {
    ok: true,
    retentionDays: PWA_PUNCH_SELFIE_RETENTION_DAYS,
    deletedFiles,
    clearedPunchPaths,
  });
});
