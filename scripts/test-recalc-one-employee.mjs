/**
 * Smoke test: readiness + recalc de 1 colaborador em uma competência.
 * Uso: npx tsx scripts/test-recalc-one-employee.mjs [year] [month] [nomeOuMatricula]
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const year = Number(process.argv[2] || 2024);
const month = Number(process.argv[3] || 8);
const needle = String(process.argv[4] || '').trim().toLowerCase();

const fileEnv = loadEnv('development', process.cwd(), '');
// Prefer local Kong for smoke tests unless explicitly overridden.
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  fileEnv.VITE_SUPABASE_URL ||
  'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  fileEnv.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NjM4MDExMzAsImV4cCI6MTk3OTM3NzEzMH0.fT5YV8mJ_4h5xK9zqP0nR2sT6uVwXyZaBcDeFgHiJkL';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

console.log('supabase_url', SUPABASE_URL);

process.env.VITE_SUPABASE_URL = SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = ANON_KEY;
// Polyfill for modules that read import.meta.env in Node
globalThis.__vite_import_meta_env__ = {
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: ANON_KEY,
};

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
const { employeeService } = await import('../src/services/employee.service.ts');
const { punchService } = await import('../src/services/punch.service.ts');

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

const employees = (await employeeService.getEmployees()).filter(
  e => e.role !== 'SUPER_ADMIN' && e.role !== 'ADMIN',
);
const withPunches = [];
for (const emp of employees) {
  const punchKey = emp.employeeId || emp.id;
  const punches = await punchService.listPunches({
    employeeId: punchKey,
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-28`,
  });
  withPunches.push({ emp, punchKey, punchCount: punches.length });
}

withPunches.sort((a, b) => b.punchCount - a.punchCount);
let pick = withPunches[0];
if (needle) {
  const found = withPunches.find(
    x =>
      x.emp.name?.toLowerCase().includes(needle) ||
      String(x.punchKey).toLowerCase() === needle ||
      x.emp.id.toLowerCase() === needle,
  );
  if (!found) {
    console.error('EMP_NOT_FOUND', needle);
    console.log(
      'candidates',
      withPunches.slice(0, 10).map(x => `${x.emp.name} (${x.punchKey}) punches=${x.punchCount}`),
    );
    process.exit(1);
  }
  pick = found;
}

console.log('=== TEST RECALC 1 COLABORADOR ===');
console.log(`org=${profile.organization_id} user=${profile.name || profile.id} role=${profile.role}`);
console.log(
  `target=${pick.emp.name} id=${pick.emp.id} matricula=${pick.punchKey} punches_in_month≈${pick.punchCount}`,
);
console.log(`competence=${String(month).padStart(2, '0')}/${year}`);

const period = await timesheetService.getOrCreatePeriod(year, month);
console.log(`period id=${period.id} status=${period.status} ${period.startDate}→${period.endDate}`);

let readinessBefore;
try {
  readinessBefore = await timesheetService.getPeriodLockReadiness(period.id);
  console.log('readiness_before', readinessBefore);
} catch (e) {
  console.error('READINESS_FAIL', e?.message || e);
  process.exit(2);
}

const beforeDays = await timesheetService.listDays(period.id, pick.punchKey);
const sampleBefore = beforeDays
  .filter(d => d.workDate.startsWith(`${year}-${String(month).padStart(2, '0')}`))
  .slice(0, 5)
  .map(d => ({
    date: d.workDate,
    status: d.status,
    worked: d.workedMinutes,
    ot: d.overtimeMinutes,
    late: d.lateMinutes,
    absence: d.absenceMinutes,
    mgr: d.managerAck,
    adj: !!d.manualAdjustment,
  }));
console.log('sample_days_before', sampleBefore);

const t0 = Date.now();
let count;
try {
  const result = await timesheetService.recalculatePeriod(year, month, [pick.emp.id]);
  count = result.count;
  console.log('recalc_result', result);
} catch (e) {
  console.error('RECALC_FAIL', e?.message || e);
  if (e?.details) console.error('details', e.details);
  if (e?.code) console.error('code', e.code);
  process.exit(3);
}
const ms = Date.now() - t0;
console.log(`recalc_ok count=${count} elapsed_ms=${ms}`);

const afterDays = await timesheetService.listDays(period.id, pick.punchKey);
const scoped = afterDays.filter(d => d.workDate >= period.startDate && d.workDate <= period.endDate);
const byStatus = {};
for (const d of scoped) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
const sampleAfter = scoped.slice(0, 8).map(d => ({
  date: d.workDate,
  status: d.status,
  worked: d.workedMinutes,
  ot: d.overtimeMinutes,
  late: d.lateMinutes,
  absence: d.absenceMinutes,
  punches: [d.firstPunchAt, d.lastPunchAt].filter(Boolean).length,
  mgr: d.managerAck,
  adj: !!d.manualAdjustment,
}));

const readinessAfter = await timesheetService.getPeriodLockReadiness(period.id);
console.log('sample_days_after', sampleAfter);
console.log('status_counts', byStatus);
console.log('days_total', scoped.length);
console.log('readiness_after', readinessAfter);
console.log('=== PASS ===');
