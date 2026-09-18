/**
 * Dump Douglas competence 09/2026 (26/08–25/09) for PWA month totals.
 * Run: npx vite-node scripts/verify-douglas-timesheet-days.mjs
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

function hm(mins) {
  const n = Number(mins) || 0;
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const dmprep = loadDmprepEnv();
const fileEnv = loadEnv('development', process.cwd(), '');
const url = process.env.OPENHR_SUPABASE_URL || dmprep.SUPABASE_URL || 'http://127.0.0.1:54321';
const key = dmprep.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error('missing service role');
const sb = createClient(url, key);
const pis = '012491638543';
const uuid = '3cb9891c-5a40-40e9-9cdf-3a2ba222416b';
const start = '2026-08-26';
const end = '2026-09-25';
const today = '2026-09-10';

const { data: profile } = await sb
  .from('profiles')
  .select('id, name, employee_id, organization_id')
  .or(`employee_id.eq.${pis},id.eq.${uuid}`)
  .maybeSingle();
console.log('profile', profile?.id, profile?.name, profile?.employee_id);

const { data: days, error: dErr } = await sb
  .from('timesheet_days')
  .select(
    'employee_id, work_date, expected_minutes, worked_minutes, absence_minutes, overtime_minutes, status, first_punch_at, last_punch_at',
  )
  .in('employee_id', [pis, uuid, profile?.id].filter(Boolean))
  .gte('work_date', start)
  .lte('work_date', end)
  .order('work_date');
if (dErr) throw dErr;

const { data: punches, error: pErr } = await sb
  .from('punches')
  .select('employee_id, punched_at, source, direction, ignored_for_calc')
  .in('employee_id', [pis, uuid, profile?.id].filter(Boolean))
  .gte('punched_at', `${start}T00:00:00-03:00`)
  .lt('punched_at', `${end}T23:59:59-03:00`)
  .order('punched_at');
if (pErr) throw pErr;

const { count: pending } = await sb
  .from('timesheet_recalc_queue')
  .select('id', { count: 'exact', head: true })
  .in('status', ['PENDING', 'FAILED', 'PROCESSING']);

console.log('queue_pending_or_failed', pending);
console.log('day_rows', days?.length, 'punch_rows', punches?.length);

let trab = 0;
let falta = 0;
let he = 0;
let faltaUntilToday = 0;
let faltaFuture = 0;
let faltaIncomplete = 0;

for (const d of days || []) {
  const abs = d.status === 'OFF' || d.status === 'HOLIDAY' || d.status === 'LEAVE'
    ? 0
    : Math.max(0, d.absence_minutes || 0);
  trab += d.worked_minutes || 0;
  he += d.overtime_minutes || 0;
  falta += abs;
  if (d.work_date > today) faltaFuture += abs;
  else faltaUntilToday += abs;
  if (d.status === 'INCOMPLETE') faltaIncomplete += abs;
  const punchCount = (punches || []).filter((p) => {
    const local = new Date(p.punched_at).toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);
    return local === d.work_date && !p.ignored_for_calc;
  }).length;
  console.log(
    d.work_date,
    d.employee_id === pis ? 'pis' : 'other',
    d.status.padEnd(11),
    'exp', hm(d.expected_minutes),
    'trab', hm(d.worked_minutes),
    'falta', hm(d.absence_minutes),
    'he', hm(d.overtime_minutes),
    'punches', punchCount,
    d.work_date > today ? 'FUTURE' : '',
  );
}

console.log('SUM all      trab', hm(trab), 'he', hm(he), 'falta', hm(falta));
console.log('SUM <=today  falta', hm(faltaUntilToday));
console.log('SUM future   falta', hm(faltaFuture));
console.log('SUM INCOMPLETE falta', hm(faltaIncomplete));

if (faltaIncomplete !== 0) {
  throw new Error(`INCOMPLETE days still booking falta ${hm(faltaIncomplete)}`);
}
if (falta !== 0) {
  throw new Error(`PWA-style falta sum still ${hm(falta)} (want 0 until a true ABSENT day)`);
}
const d01 = (days || []).find((d) => d.work_date === '2026-09-01');
if (!d01) throw new Error('missing 2026-09-01');
if ((d01.worked_minutes || 0) < 500) {
  throw new Error(`01/09 worked still ${d01.worked_minutes}`);
}
console.log('verify-douglas-timesheet-days: ok');

const punchesByDay = {};
for (const p of punches || []) {
  const local = new Date(p.punched_at).toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);
  (punchesByDay[local] ||= []).push(
    `${p.source}/${p.direction}${p.ignored_for_calc ? '/IGN' : ''} ${new Date(p.punched_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`,
  );
}
console.log('--- punches by day ---');
for (const [d, list] of Object.entries(punchesByDay).sort()) {
  console.log(d, list.join(' | '));
}
