/**
 * Audita batidas e recalcula espelho de ponto para todos os funcionários.
 * Uso: npx tsx scripts/audit-timesheet.ts [year] [month]
 */
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';

const env = loadEnv('development', process.cwd(), '');
const year = Number(process.argv[2] || new Date().getFullYear());
const month = Number(process.argv[3] || new Date().getMonth() + 1);

const SUPABASE_URL = env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

process.env.VITE_SUPABASE_URL = SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = ANON_KEY;

const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);

const { data: login, error: loginErr } = await createClient(SUPABASE_URL, ANON_KEY).auth.signInWithPassword({
  email: 'eletropasso@eletropasso.loja',
  password: 'Eletropasso_320*',
});
if (loginErr) {
  console.error('Login failed:', loginErr.message);
  process.exit(1);
}

const { supabase } = await import('../src/services/supabase.ts');
await supabase.auth.setSession({
  access_token: login.session!.access_token,
  refresh_token: login.session!.refresh_token,
});

const { apiClient } = await import('../src/services/api.client.ts');
const { timesheetService } = await import('../src/services/timesheet.service.ts');
const { employeeService } = await import('../src/services/employee.service.ts');
const { punchService } = await import('../src/services/punch.service.ts');

const profile = await adminSb.from('profiles').select('organization_id').eq('id', login.user!.id).single();
const orgId = profile.data?.organization_id;
if (!orgId) {
  console.error('No organization_id');
  process.exit(1);
}
apiClient.setOrganizationId(orgId);

try {
const employees = (await employeeService.getEmployees()).filter(e => e.role !== 'SUPER_ADMIN');
const periodBounds = (y: number, m: number) => {
  const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const end = new Date(y, m, 0);
  const endDate = `${y}-${String(m).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return { startDate, endDate };
};
const { startDate, endDate } = periodBounds(year, month);

console.log(`\n=== Auditoria espelho de ponto ${String(month).padStart(2, '0')}/${year} ===\n`);

interface PunchRow {
  name: string;
  employeeId: string;
  role: string;
  totalPunches: number;
  punchesInPeriod: number;
}

const punchAudit: PunchRow[] = [];
for (const emp of employees) {
  const punchKey = emp.employeeId || emp.id;
  const allPunches = await punchService.listPunches({ employeeId: punchKey, startDate: '2000-01-01', endDate: '2099-12-31' });
  const inPeriod = await punchService.listPunches({ employeeId: punchKey, startDate, endDate });
  punchAudit.push({
    name: emp.name,
    employeeId: punchKey,
    role: emp.role,
    totalPunches: allPunches.length,
    punchesInPeriod: inPeriod.length,
  });
}

console.log('--- Batidas por funcionário ---');
for (const row of punchAudit) {
  const flag = row.role === 'EMPLOYEE' && row.totalPunches === 0 ? ' ⚠ sem batidas' : '';
  console.log(
    `${row.name.padEnd(36)} | matrícula ${row.employeeId} | total ${String(row.totalPunches).padStart(3)} | no período ${String(row.punchesInPeriod).padStart(3)}${flag}`,
  );
}

const employeeTargets = employees.filter(e => e.role === 'EMPLOYEE');
console.log(`\n--- Recalcular espelho (${employeeTargets.length} colaboradores) ---`);

const period = await timesheetService.getOrCreatePeriod(year, month);
console.log(`Período ${period.id} status=${period.status} (${period.startDate} → ${period.endDate})`);

interface RecalcRow {
  name: string;
  employeeId: string;
  daysOk: number;
  daysTotal: number;
  error: string | null;
}

const recalcResults: RecalcRow[] = [];
for (const emp of employeeTargets) {
  const dates: string[] = [];
  const cur = new Date(`${startDate}T12:00:00`);
  const last = new Date(`${endDate}T12:00:00`);
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  let ok = 0;
  let errMsg: string | null = null;
  for (const date of dates) {
    try {
      await timesheetService.recalculateDay(emp.id, date, period);
      ok++;
    } catch (e: any) {
      errMsg = e?.message || String(e);
      break;
    }
  }
  recalcResults.push({ name: emp.name, employeeId: emp.employeeId || '', daysOk: ok, daysTotal: dates.length, error: errMsg });
}

console.log('\n--- Resultado recálculo ---');
const failures = recalcResults.filter(r => r.error);
for (const r of recalcResults) {
  if (r.error) {
    console.log(`❌ ${r.name} (${r.employeeId}): ERRO em dia ${r.daysOk + 1}/${r.daysTotal} — ${r.error}`);
  } else {
    console.log(`✅ ${r.name} (${r.employeeId}): ${r.daysOk}/${r.daysTotal} dias calculados`);
  }
}

const { data: days } = await adminSb.from('timesheet_days').select('employee_id, status').eq('period_id', period.id);
const dayStats: Record<string, Record<string, number>> = {};
for (const d of days ?? []) {
  if (!dayStats[d.employee_id]) dayStats[d.employee_id] = {};
  dayStats[d.employee_id][d.status] = (dayStats[d.employee_id][d.status] || 0) + 1;
}

console.log('\n--- Resumo status dos dias ---');
for (const emp of employeeTargets) {
  const key = emp.employeeId || emp.id;
  const stats = dayStats[key] || dayStats[emp.id] || {};
  const summary = Object.entries(stats).map(([k, v]) => `${k}:${v}`).join(', ') || 'nenhum dia';
  console.log(`${emp.name}: ${summary}`);
}

const empWithPunches = punchAudit.filter(p => p.role === 'EMPLOYEE' && p.totalPunches > 0).length;
const empNoPunches = punchAudit.filter(p => p.role === 'EMPLOYEE' && p.totalPunches === 0).length;

console.log('\n=== RESUMO ===');
console.log(`Colaboradores (EMPLOYEE): ${employeeTargets.length}`);
console.log(`Com batidas importadas: ${empWithPunches}`);
console.log(`Sem batidas: ${empNoPunches}`);
console.log(`Recálculo OK: ${recalcResults.filter(r => !r.error).length}`);
console.log(`Recálculo com erro: ${failures.length}`);

if (failures.length) process.exit(2);
} catch (err: any) {
  console.error('Audit failed:', err?.message || err);
  if (err?.details) console.error(err.details);
  if (err?.code) console.error('code:', err.code);
  process.exit(1);
}
