/**
 * Drena a fila `timesheet_recalc_queue` recalculando cada dia via o serviço real
 * (mesma lógica de calculateDay/banco usada pelo app). Fecha o ciclo:
 *   ingest-punches enfileira  →  este processador recalcula o timesheet_day.
 *
 * Sem consumidor, batidas do relógio chegavam mas o dia ficava "preso"
 * (ex.: ABSENT apesar de haver batidas). Rode periodicamente (Task Scheduler).
 *
 * Uso:
 *   npx vite-node scripts/process-recalc-queue.mjs [--limit=500] [--max-attempts=5]
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { readFileSync, existsSync } from 'node:fs';

function loadDmprepEnv() {
  const p = 'E:/RH_eletropasso/config/dmprep-sync.env';
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const dmprep = loadDmprepEnv();
const fileEnv = loadEnv('development', process.cwd(), '');
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  fileEnv.VITE_SUPABASE_URL ||
  dmprep.SUPABASE_URL ||
  'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  fileEnv.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NjM4MDExMzAsImV4cCI6MTk3OTM3NzEzMH0.fT5YV8mJ_4h5xK9zqP0nR2sT6uVwXyZaBcDeFgHiJkL';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
  dmprep.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const limit = Number((process.argv.find(a => a.startsWith('--limit=')) || '').slice('--limit='.length)) || 500;
const maxAttempts = Number((process.argv.find(a => a.startsWith('--max-attempts=')) || '').slice('--max-attempts='.length)) || 5;

process.env.VITE_SUPABASE_URL = SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = ANON_KEY;

const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);

const { data: pending, error: qErr } = await adminSb
  .from('timesheet_recalc_queue')
  .select('*')
  .in('status', ['PENDING', 'FAILED'])
  .lt('attempts', maxAttempts)
  .order('created', { ascending: true })
  .limit(limit);

if (qErr) {
  console.error('queue_read_fail', qErr.message);
  process.exit(1);
}
if (!pending || pending.length === 0) {
  console.log('Fila vazia — nada a processar.');
  process.exit(0);
}

console.log(`supabase_url ${SUPABASE_URL}`);
console.log(`Itens a processar: ${pending.length}`);

// Auth as an org admin so the service writes pass RLS (ADMIN/HR only).
const authSb = createClient(SUPABASE_URL, ANON_KEY);
const email = process.env.TEST_EMAIL || 'eletropasso@eletropasso.loja';
const password = process.env.TEST_PASSWORD || 'Eletropasso_320*';
const { data: login, error: loginErr } = await authSb.auth.signInWithPassword({ email, password });
if (loginErr) {
  console.error('LOGIN_FAIL:', loginErr.message);
  process.exit(1);
}

const { supabase } = await import('../src/services/supabase.ts');
await supabase.auth.setSession({
  access_token: login.session.access_token,
  refresh_token: login.session.refresh_token,
});

const { apiClient } = await import('../src/services/api.client.ts');
const { timesheetService } = await import('../src/services/timesheet.service.ts');

let ok = 0;
let fail = 0;
for (const job of pending) {
  // Session user is single-org; skip other orgs to avoid RLS write failures.
  apiClient.setOrganizationId(job.organization_id);
  await adminSb
    .from('timesheet_recalc_queue')
    .update({ status: 'PROCESSING', updated: new Date().toISOString() })
    .eq('id', job.id);
  try {
    await timesheetService.recalculateDay(job.employee_id, job.work_date);
    await adminSb
      .from('timesheet_recalc_queue')
      .update({
        status: 'COMPLETED',
        attempts: (job.attempts || 0) + 1,
        last_error: null,
        processed_at: new Date().toISOString(),
        updated: new Date().toISOString(),
      })
      .eq('id', job.id);
    ok++;
  } catch (e) {
    fail++;
    await adminSb
      .from('timesheet_recalc_queue')
      .update({
        status: 'FAILED',
        attempts: (job.attempts || 0) + 1,
        last_error: String(e?.message || e).slice(0, 500),
        updated: new Date().toISOString(),
      })
      .eq('id', job.id);
    if (fail <= 5) console.warn('recalc_fail', job.employee_id, job.work_date, e?.message || e);
  }
}

console.log(`Processados OK=${ok} FAIL=${fail}`);
process.exit(0);
