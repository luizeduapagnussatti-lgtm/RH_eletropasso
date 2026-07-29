/**
 * Repara dias de ponto cujos totais gravados divergem das batidas (fonte única).
 *
 * Uso:
 *   npx vite-node scripts/repair-timesheet-coherence.mjs [year] [month] [--apply] [--employee=NAME]
 *
 * Sem --apply: dry-run. Com --apply: recalcula dias em períodos não-LOCKED.
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import {
  buildDayCoherenceContext,
  checkDayCoherence,
} from '../src/utils/timesheetDayCoherence.ts';
import { punchLocalDateKey } from '../src/services/punch.service.ts';

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
const employeeFilter = (process.argv.find(a => a.startsWith('--employee=')) || '')
  .slice('--employee='.length)
  .trim()
  .toLowerCase();
const args = process.argv.slice(2).filter(a => a !== '--apply' && !a.startsWith('--employee='));
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
if (employeeFilter) console.log(`filter employee name contains: ${employeeFilter}`);
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
if (period.status === 'LOCKED') {
  console.log('Período LOCKED — nenhuma alteração permitida.');
  process.exit(0);
}

const orgId = period.organization_id;

const { data: rows, error } = await adminSb
  .from('timesheet_days')
  .select('*')
  .eq('period_id', period.id);

if (error) {
  console.error(error.message);
  process.exit(1);
}

const { data: profiles } = await adminSb
  .from('profiles')
  .select('id, employee_id, name, shift_id, joining_date, termination_date')
  .eq('organization_id', orgId);

const nameByEmp = new Map();
const profileByEmp = new Map();
for (const p of profiles || []) {
  const key = p.employee_id || p.id;
  nameByEmp.set(key, (p.name || '').toLowerCase());
  profileByEmp.set(key, p);
}

const { data: shiftRows } = await adminSb.from('shifts').select('*').eq('organization_id', orgId);
const shifts = (shiftRows || []).map(s => ({
  id: s.id,
  name: s.name,
  startTime: s.start_time,
  endTime: s.end_time,
  lateGracePeriod: s.late_grace_period ?? 0,
  earlyOutGracePeriod: s.early_out_grace_period ?? 0,
  workingDays: s.working_days || [],
  breakDurationMinutes: s.break_duration_minutes,
  organizationId: s.organization_id,
  isDefault: !!s.is_default,
}));

const { data: settingsRows } = await adminSb
  .from('settings')
  .select('key, value')
  .eq('organization_id', orgId)
  .in('key', ['holidays']);

let holidays = [];
for (const row of settingsRows || []) {
  if (row.key === 'holidays' && Array.isArray(row.value)) holidays = row.value;
}

const { data: leaveRows } = await adminSb
  .from('leaves')
  .select('id, employee_id, start_date, end_date, status')
  .eq('organization_id', orgId)
  .eq('status', 'APPROVED');

const leaves = (leaveRows || []).map(l => ({
  id: l.id,
  employeeId: l.employee_id,
  startDate: l.start_date,
  endDate: l.end_date,
  status: l.status,
}));

const mapped = (rows || []).map(r => ({
  id: r.id,
  employeeId: r.employee_id,
  workDate: r.work_date,
  shiftId: r.shift_id || undefined,
  status: r.status,
  expectedMinutes: Number(r.expected_minutes || 0),
  workedMinutes: Number(r.worked_minutes || 0),
  breakMinutes: Number(r.break_minutes || 0),
  lateMinutes: Number(r.late_minutes || 0),
  earlyOutMinutes: Number(r.early_out_minutes || 0),
  overtimeMinutes: Number(r.overtime_minutes || 0),
  nightMinutes: Number(r.night_minutes || 0),
  absenceMinutes: Number(r.absence_minutes || 0),
  remarks: r.remarks || undefined,
  managerAck: !!r.manager_ack,
  manualAdjustment: r.manual_adjustment,
}));

const { data: punchRows, error: punchErr } = await adminSb
  .from('punches')
  .select('id, employee_id, punched_at, ignored_for_calc, direction, source')
  .eq('organization_id', orgId)
  .gte('punched_at', `${period.start_date}T00:00:00.000-03:00`)
  .lte('punched_at', `${period.end_date}T23:59:59.999-03:00`)
  .limit(50000);

if (punchErr) {
  console.error(punchErr.message);
  process.exit(1);
}

const punchMap = new Map();
for (const p of punchRows || []) {
  const key = `${p.employee_id}|${punchLocalDateKey(p.punched_at)}`;
  if (!punchMap.has(key)) punchMap.set(key, []);
  punchMap.get(key).push({
    id: p.id,
    punchedAt: p.punched_at,
    direction: p.direction || 'UNKNOWN',
    ignoredForCalc: !!p.ignored_for_calc,
    employeeId: p.employee_id,
    organizationId: orgId,
    source: p.source || 'CLOCK',
  });
}

const incoherent = [];

for (const day of mapped) {
  if (employeeFilter) {
    const nm = nameByEmp.get(day.employeeId) || '';
    if (!nm.includes(employeeFilter)) continue;
  }

  const punches = punchMap.get(`${day.employeeId}|${day.workDate}`) || [];
  const prof = profileByEmp.get(day.employeeId);
  const shift =
    shifts.find(s => s.id === day.shiftId) ||
    shifts.find(s => s.id === prof?.shift_id) ||
    shifts.find(s => s.isDefault) ||
    null;

  const ctx = buildDayCoherenceContext(day, {
    shift,
    holidays,
    leaves,
    employee: prof
      ? {
          id: prof.id,
          employeeId: prof.employee_id,
          shiftId: prof.shift_id,
          joiningDate: prof.joining_date,
          terminationDate: prof.termination_date,
        }
      : undefined,
  });

  const { coherent, diffs, computed } = checkDayCoherence(day, punches, ctx);
  if (!coherent) {
    incoherent.push({
      day,
      punches,
      diffs,
      computed,
      employeeName: nameByEmp.get(day.employeeId) || day.employeeId,
    });
  }
}

console.log(`Dias analisados: ${mapped.length}`);
console.log(`Incoerentes: ${incoherent.length}`);

for (const item of incoherent.slice(0, 30)) {
  const d = item.day;
  const diffSummary = item.diffs
    .map(x => `${x.field}: stored=${x.stored} computed=${x.computed}`)
    .join('; ');
  console.log(
    `  ${d.workDate} emp=${item.employeeName} status=${d.status} worked=${d.workedMinutes}→${item.computed.workedMinutes} | ${diffSummary}`,
  );
}
if (incoherent.length > 30) {
  console.log(`  … +${incoherent.length - 30} more`);
}

if (!apply) {
  console.log('\nDry-run — nenhuma alteração. Rode com --apply para recalcular via timesheetService.');
  process.exit(0);
}

if (incoherent.length === 0) {
  console.log('Nada a reparar.');
  process.exit(0);
}

const authSb = createClient(SUPABASE_URL, ANON_KEY);
const email = process.env.TEST_EMAIL || 'eletropasso@eletropasso.loja';
const password = process.env.TEST_PASSWORD || 'Eletropasso_320*';
const { data: login, error: loginErr } = await authSb.auth.signInWithPassword({ email, password });
if (loginErr) {
  console.error('LOGIN_FAIL — recalc não executado:', loginErr.message);
  process.exit(1);
}

const { supabase } = await import('../src/services/supabase.ts');
await supabase.auth.setSession({
  access_token: login.session.access_token,
  refresh_token: login.session.refresh_token,
});

const { apiClient } = await import('../src/services/api.client.ts');
const { timesheetService } = await import('../src/services/timesheet.service.ts');
apiClient.setOrganizationId(orgId);

const periodObj = await timesheetService.getOrCreatePeriod(year, month);
const targets = new Map();
for (const item of incoherent) {
  targets.set(`${item.day.employeeId}|${item.day.workDate}`, {
    employeeId: item.day.employeeId,
    workDate: item.day.workDate,
  });
}

let ok = 0;
let fail = 0;
for (const target of targets.values()) {
  try {
    await timesheetService.recalculateDay(target.employeeId, target.workDate, periodObj);
    ok++;
  } catch (e) {
    fail++;
    if (fail <= 5) {
      console.warn('recalc_fail', target.employeeId, target.workDate, e?.message || e);
    }
  }
}

console.log(`Recalc OK=${ok} FAIL=${fail}`);
console.log('Concluído.');
