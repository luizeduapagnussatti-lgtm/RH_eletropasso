// PTRP — Ingest validated punches from the isolated REP gateway.
// This is NOT the public hardware endpoint. The gateway owns vendor protocol/RSA.
// Auth: x-ingest-key or Bearer PUNCH_INGEST_API_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://192.168.15.245:3000',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
};

const directions = new Set(['IN', 'OUT', 'BREAK_START', 'BREAK_END', 'UNKNOWN']);
const sources = new Set(['CLOCK']);
const maxBatchSize = 100;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const ingestKey = Deno.env.get('PUNCH_INGEST_API_KEY') || Deno.env.get('CRON_SECRET');
  const expectedOrganizationId = Deno.env.get('PUNCH_INGEST_ORGANIZATION_ID');
  const expectedDeviceSerial = Deno.env.get('PUNCH_INGEST_DEVICE_SERIAL');
  const auth = req.headers.get('Authorization') || '';
  const headerKey = req.headers.get('x-ingest-key') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (
    !ingestKey ||
    !expectedOrganizationId ||
    !expectedDeviceSerial ||
    !(await safeEqual(token || headerKey, ingestKey))
  ) {
    return json(401, { error: 'Unauthorized' });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const organizationId = String(body.organizationId || '');
  const deviceSerial = String(body.deviceSerial || '');
  const punches = Array.isArray(body.punches) ? body.punches : [];
  if (
    organizationId !== expectedOrganizationId ||
    deviceSerial !== expectedDeviceSerial
  ) {
    return json(403, { error: 'Organization or device binding mismatch' });
  }
  if (punches.length === 0 || punches.length > maxBatchSize) {
    return json(400, { error: `punches[] must contain 1-${maxBatchSize} items` });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const rows: Array<Record<string, unknown>> = [];
  for (const punch of punches) {
    const employeeId = String(punch.employeeId || punch.employee_id || '').trim();
    const punchedAt = String(punch.punchedAt || punch.punched_at || '');
    const direction = String(punch.direction || 'UNKNOWN').toUpperCase();
    const source = String(punch.source || 'CLOCK').toUpperCase();
    const deviceId = String(punch.deviceId || punch.device_id || '');
    const nsr = String(punch.nsr ?? '').trim();

    if (
      !employeeId ||
      !isTimestampWithTimezone(punchedAt) ||
      !directions.has(direction) ||
      !sources.has(source) ||
      deviceId !== expectedDeviceSerial ||
      !nsr ||
      nsr.length > 200
    ) {
      return json(400, { error: 'Invalid punch fields, device, timestamp, or idempotency key' });
    }

    rows.push({
      organization_id: organizationId,
      employee_id: employeeId,
      punched_at: punchedAt,
      direction,
      source,
      device_id: deviceId,
      nsr,
      raw_payload: sanitizeRawPayload(punch.raw || punch.raw_payload),
    });
  }

  // A clock identifier must resolve to exactly one employee in this tenant.
  const employeeIds = [...new Set(rows.map((row) => String(row.employee_id)))];
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id,employee_id')
    .eq('organization_id', organizationId)
    .in('employee_id', employeeIds);
  if (profileError) return json(500, { error: 'Employee validation failed' });

  const profileCounts = new Map<string, number>();
  for (const profile of profiles ?? []) {
    const employeeId = String(profile.employee_id || '');
    profileCounts.set(employeeId, (profileCounts.get(employeeId) ?? 0) + 1);
  }
  const unresolved = employeeIds.filter((id) => profileCounts.get(id) !== 1);
  if (unresolved.length > 0) {
    return json(422, { error: 'Unknown or ambiguous employee identifier', employeeIds: unresolved });
  }

  let inserted = 0;
  let duplicates = 0;
  for (const row of rows) {
    const { error } = await admin.from('punches').insert(row);
    if (!error) {
      inserted++;
    } else if (error.code === '23505') {
      duplicates++;
    } else {
      console.error('[INGEST-PUNCHES] Insert failed:', error.code, error.message);
      return json(500, { error: 'Punch persistence failed' });
    }
  }

  // Queue one asynchronous recalculation per employee/local work date.
  const recalcRows = [
    ...new Map(
      rows.map((row) => {
        const employeeId = String(row.employee_id);
        const workDate = saoPauloDate(String(row.punched_at));
        return [
          `${employeeId}:${workDate}`,
          {
            organization_id: organizationId,
            employee_id: employeeId,
            work_date: workDate,
            status: 'PENDING',
          },
        ];
      }),
    ).values(),
  ];
  const { error: queueError } = await admin
    .from('timesheet_recalc_queue')
    .upsert(recalcRows, {
      onConflict: 'organization_id,employee_id,work_date',
      ignoreDuplicates: true,
    });
  if (queueError) {
    console.error('[INGEST-PUNCHES] Recalc queue failed:', queueError.code, queueError.message);
  }

  const affected = [...new Set(recalcRows.map((row) => row.work_date))];

  return json(200, {
    success: true,
    inserted,
    upserted: duplicates,
    duplicates,
    affectedDates: affected,
    recalcQueued: !queueError,
  });
});

async function safeEqual(candidate: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(candidateHash);
  const b = new Uint8Array(expectedHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function isTimestampWithTimezone(value: string): boolean {
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const now = Date.now();
  return timestamp >= now - 366 * 24 * 60 * 60 * 1000 && timestamp <= now + 10 * 60 * 1000;
}

function saoPauloDate(timestamp: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

function sanitizeRawPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const blocked = new Set(['password', 'senha', 'authorization', 'cookie', 'cpf']);
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([key]) => !blocked.has(key.toLowerCase()))
      .slice(0, 50),
  );
}
