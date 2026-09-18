/**
 * Audita aprovações inválidas no espelho (manager_ack sem batidas / ABSENT / INCOMPLETE)
 * e dias de folga ainda classificados como OK/ABSENT.
 *
 * Uso:
 *   npx vite-node scripts/audit-timesheet-invalid-acks.mjs [year] [month]
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { isDayApprovable } from '../src/utils/timesheetDayAckValidation.ts';

const fileEnv = loadEnv('development', process.cwd(), '');
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const now = new Date();
let year = Number(process.argv[2] || 0);
let month = Number(process.argv[3] || 0);
if (!year || !month) {
  year = now.getFullYear();
  month = now.getMonth() + 1;
  if (now.getDate() >= 26) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const { data: period, error: periodErr } = await sb
  .from('timesheet_periods')
  .select('id, year, month, start_date, end_date, status')
  .eq('year', year)
  .eq('month', month)
  .maybeSingle();

if (periodErr) {
  console.error('period_error', periodErr.message);
  process.exit(1);
}
if (!period) {
  console.log(`Nenhum período ${String(month).padStart(2, '0')}/${year}`);
  process.exit(0);
}

console.log(
  `Auditoria acks inválidos — competência ${String(month).padStart(2, '0')}/${year} (${period.start_date} → ${period.end_date}) status=${period.status}`
);

const { data: rows, error } = await sb
  .from('timesheet_days')
  .select(
    'id, employee_id, work_date, status, expected_minutes, worked_minutes, first_punch_at, last_punch_at, remarks, manager_ack'
  )
  .eq('period_id', period.id);

if (error) {
  console.error('days_error', error.message);
  process.exit(1);
}

const days = (rows || []).map(r => ({
  id: r.id,
  employeeId: r.employee_id,
  workDate: r.work_date,
  status: r.status,
  expectedMinutes: Number(r.expected_minutes || 0),
  workedMinutes: Number(r.worked_minutes || 0),
  firstPunchAt: r.first_punch_at || undefined,
  lastPunchAt: r.last_punch_at || undefined,
  remarks: r.remarks || undefined,
  managerAck: !!r.manager_ack,
  employeeAck: false,
  organizationId: '',
  periodId: period.id,
  calcVersion: 0,
  lateMinutes: 0,
  earlyOutMinutes: 0,
  overtimeMinutes: 0,
  nightMinutes: 0,
  absenceMinutes: 0,
  breakMinutes: 0,
}));

const { data: punchRows, error: punchErr } = await sb
  .from('punches')
  .select('employee_id, punched_at, ignored_for_calc, direction, source')
  .gte('punched_at', `${period.start_date}T00:00:00.000-03:00`)
  .lte('punched_at', `${period.end_date}T23:59:59.999-03:00`)
  .limit(20000);

if (punchErr) {
  console.error('punches_error', punchErr.message);
  process.exit(1);
}

function localDateKey(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const punchMap = new Map();
for (const p of punchRows || []) {
  if (p.ignored_for_calc) continue;
  const key = `${p.employee_id}|${localDateKey(p.punched_at)}`;
  if (!punchMap.has(key)) punchMap.set(key, []);
  punchMap.get(key).push({
    id: '',
    punchedAt: p.punched_at,
    direction: p.direction || 'UNKNOWN',
    ignoredForCalc: !!p.ignored_for_calc,
    employeeId: p.employee_id,
    organizationId: '',
    source: p.source || 'CLOCK',
  });
}

const invalidAcks = [];
const suspectRestAsAbsent = [];
const legacyOkRest = [];

for (const day of days) {
  if (day.managerAck) {
    const punches = punchMap.get(`${day.employeeId}|${day.workDate}`) || [];
    const v = isDayApprovable(day, punches);
    if (!v.ok) {
      invalidAcks.push({ ...day, reason: v.reason });
    }
  }
  const dow = new Date(`${day.workDate}T12:00:00`).getDay();
  if (dow === 0 && day.status === 'ABSENT') {
    suspectRestAsAbsent.push(day);
  }
  if (day.status === 'OK' && day.expectedMinutes === 0) {
    legacyOkRest.push(day);
  }
}

console.log(`\nTotal dias: ${days.length}`);
console.log(`Aprovações inválidas (manager_ack=true): ${invalidAcks.length}`);
console.log(`Domingos como ABSENT: ${suspectRestAsAbsent.length}`);
console.log(`Folgas legadas (OK + expected=0 → virarão OFF no recalc): ${legacyOkRest.length}`);

const byReason = {};
for (const row of invalidAcks) {
  byReason[row.reason] = (byReason[row.reason] || 0) + 1;
}
console.log('\nPor motivo:', byReason);

const sample = invalidAcks.slice(0, 40);
if (sample.length) {
  console.log('\nAmostra (até 40):');
  for (const row of sample) {
    console.log(
      `  ${row.workDate} emp=${row.employeeId} status=${row.status} reason=${row.reason} id=${row.id}`
    );
  }
}

if (suspectRestAsAbsent.length) {
  console.log('\nDomingos ABSENT (amostra):');
  for (const row of suspectRestAsAbsent.slice(0, 20)) {
    console.log(`  ${row.workDate} emp=${row.employeeId} id=${row.id}`);
  }
}

console.log(
  '\nPróximo passo: npx vite-node scripts/repair-timesheet-acks-and-off-days.mjs',
  year,
  month
);
console.log('  (dry-run por padrão; adicione --apply para gravar)');
