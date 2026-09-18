/**
 * Repara aprovações inválidas e promove folgas para status OFF via recalc.
 *
 * Uso:
 *   npx vite-node scripts/repair-timesheet-acks-and-off-days.mjs [year] [month] [--apply]
 *
 * Sem --apply: dry-run. Com --apply: revoga manager_ack inválidos e recalcula candidatos OFF.
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { isDayApprovable } from '../src/utils/timesheetDayAckValidation.ts';

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

const apply = process.argv.includes('--apply');
const args = process.argv.slice(2).filter(a => a !== '--apply');
const now = new Date();
let year = Number(args[0] || 0);
let month = Number(args[1] || 0);
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

process.env.VITE_SUPABASE_URL = SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = ANON_KEY;

const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);

console.log(`mode=${apply ? 'APPLY' : 'DRY-RUN'} competence=${String(month).padStart(2, '0')}/${year}`);
console.log('supabase_url', SUPABASE_URL);

const { data: period, error: periodErr } = await adminSb
  .from('timesheet_periods')
  .select('*')
  .eq('year', year)
  .eq('month', month)
  .maybeSingle();

if (periodErr) {
  console.error(periodErr.message);
  process.exit(1);
}
if (!period) {
  console.log('Período não encontrado.');
  process.exit(0);
}

const { data: rows, error } = await adminSb
  .from('timesheet_days')
  .select('*')
  .eq('period_id', period.id);

if (error) {
  console.error(error.message);
  process.exit(1);
}

const mapped = (rows || []).map(r => ({
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
  employeeAck: !!r.employee_ack,
  organizationId: r.organization_id,
  periodId: r.period_id,
  calcVersion: r.calc_version || 0,
  lateMinutes: Number(r.late_minutes || 0),
  earlyOutMinutes: Number(r.early_out_minutes || 0),
  overtimeMinutes: Number(r.overtime_minutes || 0),
  nightMinutes: Number(r.night_minutes || 0),
  absenceMinutes: Number(r.absence_minutes || 0),
  breakMinutes: Number(r.break_minutes || 0),
}));

const { data: punchRows, error: punchErr } = await adminSb
  .from('punches')
  .select('employee_id, punched_at, ignored_for_calc, direction, source')
  .gte('punched_at', `${period.start_date}T00:00:00.000-03:00`)
  .lte('punched_at', `${period.end_date}T23:59:59.999-03:00`)
  .limit(20000);

if (punchErr) {
  console.error(punchErr.message);
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

const revokeIds = [];
const recalcTargets = new Map();

for (const day of mapped) {
  const punches = punchMap.get(`${day.employeeId}|${day.workDate}`) || [];
  if (day.managerAck && !isDayApprovable(day, punches).ok) {
    revokeIds.push(day.id);
  }
  const dow = new Date(`${day.workDate}T12:00:00`).getDay();
  const needsOffRecalc =
    (day.status === 'OK' && day.expectedMinutes === 0) ||
    (dow === 0 && day.status === 'ABSENT') ||
    (day.status === 'ABSENT' && day.expectedMinutes === 0);
  if (needsOffRecalc) {
    recalcTargets.set(`${day.employeeId}|${day.workDate}`, {
      employeeId: day.employeeId,
      workDate: day.workDate,
    });
  }
}

console.log(`Revogar manager_ack: ${revokeIds.length}`);
console.log(`Recalc candidatos (OFF/HOLIDAY): ${recalcTargets.size}`);

if (!apply) {
  console.log('\nDry-run — nenhuma alteração. Rode com --apply para gravar.');
  for (const id of revokeIds.slice(0, 15)) {
    const d = mapped.find(x => x.id === id);
    console.log(`  would revoke ${d?.workDate} emp=${d?.employeeId} status=${d?.status}`);
  }
  process.exit(0);
}

const chunk = 80;
for (let i = 0; i < revokeIds.length; i += chunk) {
  const slice = revokeIds.slice(i, i + chunk);
  const { error: upErr } = await adminSb
    .from('timesheet_days')
    .update({ manager_ack: false })
    .in('id', slice);
  if (upErr) {
    console.error('revoke_failed', upErr.message);
    process.exit(1);
  }
}
console.log(`Revogados: ${revokeIds.length}`);

const authSb = createClient(SUPABASE_URL, ANON_KEY);
const email = process.env.TEST_EMAIL || 'eletropasso@eletropasso.loja';
const password = process.env.TEST_PASSWORD || 'Eletropasso_320*';
const { data: login, error: loginErr } = await authSb.auth.signInWithPassword({ email, password });
if (loginErr) {
  console.error('LOGIN_FAIL — acks revogados, mas recalc pulado:', loginErr.message);
  process.exit(0);
}

const { supabase } = await import('../src/services/supabase.ts');
await supabase.auth.setSession({
  access_token: login.session.access_token,
  refresh_token: login.session.refresh_token,
});

const { apiClient } = await import('../src/services/api.client.ts');
const { timesheetService } = await import('../src/services/timesheet.service.ts');

const { data: profile } = await adminSb
  .from('profiles')
  .select('organization_id')
  .eq('id', login.user.id)
  .single();
if (profile?.organization_id) {
  apiClient.setOrganizationId(profile.organization_id);
}

const periodObj = await timesheetService.getOrCreatePeriod(year, month);
let recalcOk = 0;
let recalcFail = 0;
for (const target of recalcTargets.values()) {
  try {
    await timesheetService.recalculateDay(target.employeeId, target.workDate, periodObj);
    recalcOk++;
  } catch (e) {
    recalcFail++;
    if (recalcFail <= 5) {
      console.warn('recalc_fail', target.employeeId, target.workDate, e?.message || e);
    }
  }
}

console.log(`Recalc OK=${recalcOk} FAIL=${recalcFail}`);
console.log('Concluído.');
