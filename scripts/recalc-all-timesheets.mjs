/**
 * Recalcula espelho de todos os colaboradores de uma competência e valida amostra.
 * Uso: npx tsx scripts/recalc-all-timesheets.mjs [year] [month]
 * Default: competência de hoje (periodStartDay 26 → jul/28 = ago/2026).
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { readFileSync, existsSync } from 'node:fs';

function loadDmprepEnv() {
  const path = 'E:/RH_eletropasso/config/dmprep-sync.env';
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
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
  dmprep.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

process.env.VITE_SUPABASE_URL = SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = ANON_KEY;
globalThis.__vite_import_meta_env__ = {
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: ANON_KEY,
};

const now = new Date();
// periodStartDay 26: on/after 26 → next month competence
let year = Number(process.argv[2] || 0);
let month = Number(process.argv[3] || 0);
if (!year || !month) {
  const d = now.getDate();
  year = now.getFullYear();
  month = now.getMonth() + 1;
  if (d >= 26) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

console.log('supabase_url', SUPABASE_URL);
console.log(`competence=${String(month).padStart(2, '0')}/${year}`);

const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);
const authSb = createClient(SUPABASE_URL, ANON_KEY);

const email = process.env.TEST_EMAIL || 'eletropasso@eletropasso.loja';
const password = process.env.TEST_PASSWORD || 'Eletropasso_320*';

const { data: login, error: loginErr } = await authSb.auth.signInWithPassword({ email, password });
if (loginErr) {
  console.error('LOGIN_FAIL', loginErr.message);
  process.exit(1);
}

const { supabase } = await import('../src/services/supabase.ts');
await supabase.auth.setSession({
  access_token: login.session.access_token,
  refresh_token: login.session.refresh_token,
});

const { apiClient } = await import('../src/services/api.client.ts');
const { timesheetService } = await import('../src/services/timesheet.service.ts');

const { data: profile, error: profileErr } = await adminSb
  .from('profiles')
  .select('id, name, organization_id, role')
  .eq('id', login.user.id)
  .single();
if (profileErr || !profile?.organization_id) {
  console.error('PROFILE_FAIL', profileErr?.message || 'no org');
  process.exit(1);
}
apiClient.setOrganizationId(profile.organization_id);
console.log(`org=${profile.organization_id} as=${profile.name} (${profile.role})`);

const period = await timesheetService.getOrCreatePeriod(year, month);
console.log(`period id=${period.id} status=${period.status} ${period.startDate}→${period.endDate}`);
if (period.status === 'LOCKED') {
  console.error('Period LOCKED — cannot recalculate');
  process.exit(2);
}

const t0 = Date.now();
let result;
try {
  result = await timesheetService.recalculatePeriod(year, month);
} catch (e) {
  console.error('RECALC_FAIL', e?.message || e);
  process.exit(3);
}
const ms = Date.now() - t0;
console.log('recalc_result', { ...result, elapsed_ms: ms, elapsed_min: +(ms / 60000).toFixed(2) });

// --- Verification ---
const yandiPis = '021480709869';
const victorPis = '020472460735';

async function sampleEmployee(pis, nameLabel) {
  const days = await timesheetService.listDays(period.id, pis);
  const focus = days.filter((d) => d.workDate >= '2026-07-26' && d.workDate <= '2026-07-28');
  const { data: punches } = await adminSb
    .from('punches')
    .select('punched_at, nsr')
    .eq('employee_id', pis)
    .gte('punched_at', '2026-07-26T00:00:00')
    .lte('punched_at', '2026-07-29T00:00:00')
    .order('punched_at');
  console.log(`\n=== ${nameLabel} (${pis}) ===`);
  console.log(
    'punches_db',
    (punches || []).map((p) => `${p.nsr}@${p.punched_at}`),
  );
  for (const d of focus) {
    const ok =
      d.workedMinutes > 0
        ? 'HAS_WORK'
        : punches?.length && d.workDate !== '2026-07-26'
          ? 'STILL_ZERO_BUT_HAS_PUNCHES'
          : d.status;
    console.log(
      `  ${d.workDate} status=${d.status} worked=${d.workedMinutes}m absence=${d.absenceMinutes}m first=${d.firstPunchAt || '-'} → ${ok}`,
    );
  }
  return focus;
}

const yandiDays = await sampleEmployee(yandiPis, 'Yandi');
await sampleEmployee(victorPis, 'Victor');

// Aggregate period health
const allDays = await timesheetService.listDays(period.id);
const byStatus = {};
let withWork = 0;
let withPunchesAbsent = 0;
for (const d of allDays) {
  byStatus[d.status] = (byStatus[d.status] || 0) + 1;
  if (d.workedMinutes > 0) withWork++;
  if (d.status === 'ABSENT' && d.firstPunchAt) withPunchesAbsent++;
}
console.log('\n=== PERIOD HEALTH ===');
console.log('days_total', allDays.length);
console.log('status_counts', byStatus);
console.log('days_with_worked_minutes', withWork);
console.log('absent_but_has_first_punch', withPunchesAbsent);

const yandi27 = yandiDays.find((d) => d.workDate === '2026-07-27');
const yandi28 = yandiDays.find((d) => d.workDate === '2026-07-28');
const yandiOk =
  yandi27 &&
  yandi27.workedMinutes > 0 &&
  yandi27.status !== 'ABSENT' &&
  yandi28 &&
  (yandi28.workedMinutes > 0 || yandi28.firstPunchAt); // 28 may be open day (only in)

if (yandiOk) {
  console.log('\n=== PASS: Yandi 27/28 recalculated correctly ===');
  process.exit(0);
}

console.log('\n=== WARN: check Yandi sample above ===');
process.exit(result.failed > 0 ? 4 : 0);
