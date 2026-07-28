/**
 * Recalcula espelho por pares (manhã+tarde), limpa AUTO ignore indevido,
 * preserva dias ADJUSTED com manual_adjustment do gestor.
 *
 * Uso:
 *   node scripts/fix-timesheet-pair-recalc.mjs           # aplica
 *   node scripts/fix-timesheet-pair-recalc.mjs --dry-run
 *
 * Env: URL, ANON, EMAIL, PASSWORD  (ou defaults locais)
 */
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const START = process.env.START_DATE || '2026-06-26';
const END = process.env.END_DATE || '2026-07-25';
const ONLY = process.env.ONLY_EMPLOYEE_ID || ''; // optional PIS filter

const url = process.env.URL || 'http://127.0.0.1:54321';
const anon = process.env.ANON;
const email = process.env.EMAIL || 'eletropasso@eletropasso.loja';
const password = process.env.PASSWORD || 'Eletropasso_320*';

if (!anon) {
  console.error('Missing ANON key');
  process.exit(1);
}

const sb = createClient(url, anon);
const { error: loginErr } = await sb.auth.signInWithPassword({ email, password });
if (loginErr) {
  console.error('Login failed', loginErr.message);
  process.exit(1);
}

const PROX_MIN = 10;

function minutesBetween(a, b) {
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  if (!Number.isFinite(x) || !Number.isFinite(y) || y <= x) return 0;
  return Math.round((y - x) / 60000);
}

function planProximity(punches) {
  const eligible = punches
    .filter((p) => p.source === 'CLOCK' || p.source === 'IMPORT')
    .sort((a, b) => String(a.punched_at).localeCompare(String(b.punched_at)));

  const shouldIgnore = new Set();
  let lastKept = null;
  for (const p of eligible) {
    if (p.ignore_source === 'MANUAL') {
      if (!p.ignored_for_calc) lastKept = p;
      continue;
    }
    if (!lastKept) {
      lastKept = p;
      continue;
    }
    if (minutesBetween(lastKept.punched_at, p.punched_at) <= PROX_MIN) {
      shouldIgnore.add(p.id);
    } else {
      lastKept = p;
    }
  }

  const toIgnore = [];
  const toClear = [];
  for (const p of eligible) {
    if (p.ignore_source === 'MANUAL') continue;
    const want = shouldIgnore.has(p.id);
    const currentlyAuto =
      !!p.ignored_for_calc && (p.ignore_source === 'AUTO' || !p.ignore_source);
    if (want && !currentlyAuto) toIgnore.push(p.id);
    if (!want && currentlyAuto) toClear.push(p.id);
  }
  return { toIgnore, toClear };
}

function resolveWorked(punches, scheduledBreak) {
  const day = punches
    .filter(
      (p) =>
        !p.ignored_for_calc &&
        p.direction !== 'BREAK_START' &&
        p.direction !== 'BREAK_END',
    )
    .sort((a, b) => String(a.punched_at).localeCompare(String(b.punched_at)));

  let paired = 0;
  let pairs = 0;
  for (let i = 0; i + 1 < day.length; i += 2) {
    paired += minutesBetween(day[i].punched_at, day[i + 1].punched_at);
    pairs++;
  }
  const gap =
    day.length >= 4 ? minutesBetween(day[1].punched_at, day[2].punched_at) : null;
  const first = day[0]?.punched_at;
  const lastPairOut = pairs > 0 ? day[pairs * 2 - 1]?.punched_at : undefined;
  const incomplete = day.length % 2 === 1;

  if (pairs === 0) {
    return {
      worked: 0,
      breakMinutes: 0,
      first,
      last: lastPairOut,
      pairs,
      punchCount: day.length,
      incomplete: day.length > 0,
    };
  }
  if (pairs >= 2) {
    return {
      worked: paired,
      breakMinutes: gap ?? scheduledBreak,
      first,
      last: lastPairOut,
      pairs,
      punchCount: day.length,
      incomplete,
    };
  }
  // 3 batidas (falta 1 do almoço): 1ª→última − intervalo
  if (day.length === 3 && incomplete) {
    const last = day[2].punched_at;
    return {
      worked: Math.max(0, minutesBetween(first, last) - scheduledBreak),
      breakMinutes: scheduledBreak,
      first,
      last,
      pairs: 1,
      punchCount: 3,
      incomplete: true,
    };
  }
  return {
    worked: Math.max(0, paired - scheduledBreak),
    breakMinutes: scheduledBreak,
    first,
    last: lastPairOut,
    pairs,
    punchCount: day.length,
    incomplete,
  };
}

function eachDate(start, end) {
  const out = [];
  const d = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const { data: profiles, error: pe } = await sb
  .from('profiles')
  .select('id,name,employee_id,status,role')
  .not('employee_id', 'is', null)
  .order('name');
if (pe) throw pe;

const staff = (profiles || []).filter(
  (p) =>
    p.employee_id &&
    p.role !== 'SUPER_ADMIN' &&
    (!ONLY || p.employee_id === ONLY || p.id === ONLY),
);

const dates = eachDate(START, END);
const report = [];

for (const emp of staff) {
  const pis = emp.employee_id;
  let empChanges = 0;

  for (const date of dates) {
    const { data: dayRow } = await sb
      .from('timesheet_days')
      .select('*')
      .eq('employee_id', pis)
      .eq('work_date', date)
      .maybeSingle();

    const { data: punchesRaw } = await sb
      .from('punches')
      .select('*')
      .eq('employee_id', pis)
      .gte('punched_at', `${date}T00:00:00.000-03:00`)
      .lte('punched_at', `${date}T23:59:59.999-03:00`)
      .order('punched_at');

    const punches = punchesRaw || [];
    if (!dayRow && punches.length === 0) continue;

    // Preserve manager hour edits
    const hasManualAdj =
      dayRow?.status === 'ADJUSTED' &&
      dayRow.manual_adjustment &&
      typeof dayRow.manual_adjustment === 'object' &&
      Object.keys(dayRow.manual_adjustment).length > 0;

    if (hasManualAdj) {
      report.push({
        name: emp.name,
        date,
        action: 'SKIP_ADJUSTED',
        worked: dayRow.worked_minutes,
        absence: dayRow.absence_minutes,
      });
      continue;
    }

    const plan = planProximity(punches);
    if (!DRY && (plan.toIgnore.length || plan.toClear.length)) {
      for (const id of plan.toClear) {
        const { error } = await sb.rpc('set_punch_ignored_for_calc', {
          p_id: id,
          p_ignored: false,
        });
        if (error) {
          await sb
            .from('punches')
            .update({
              ignored_for_calc: false,
              ignore_source: null,
              ignored_at: null,
              ignored_by: null,
            })
            .eq('id', id)
            .eq('ignore_source', 'AUTO');
        }
      }
      for (const id of plan.toIgnore) {
        await sb.rpc('set_punch_ignored_for_calc', { p_id: id, p_ignored: true });
      }
    }

    const { data: punches2 } = await sb
      .from('punches')
      .select('*')
      .eq('employee_id', pis)
      .gte('punched_at', `${date}T00:00:00.000-03:00`)
      .lte('punched_at', `${date}T23:59:59.999-03:00`)
      .order('punched_at');

    const effective = DRY
      ? punches.map((p) => {
          let ignored = p.ignored_for_calc;
          if (plan.toClear.includes(p.id)) ignored = false;
          if (plan.toIgnore.includes(p.id)) ignored = true;
          return { ...p, ignored_for_calc: ignored };
        })
      : punches2 || punches;

    const scheduledBreak = Number(dayRow?.break_minutes > 0 ? dayRow.break_minutes : 105);
    // Prefer shift-like default 105 when single-pair; multi-pair uses gap
    const expected = Number(dayRow?.expected_minutes ?? 480);
    const calc = resolveWorked(
      effective,
      expected > 0 && expected < 300 ? 0 : 105, // saturday short days often 225 expected, break 0
    );

    // If expected is saturday half-day (~225), use break 0 for single pair
    const calc2 =
      expected > 0 && expected <= 240
        ? resolveWorked(effective, 0)
        : calc;

    const worked = calc2.worked;
    const breakMinutes = calc2.breakMinutes;
    const ot = Math.max(0, worked - expected);
    const absence = expected > 0 ? Math.max(0, expected - worked) : 0;
    let status = dayRow?.status || 'OK';
    if (status !== 'ADJUSTED') {
      if (!calc2.first && expected > 0) status = 'ABSENT';
      else if (calc2.incomplete && worked === 0 && calc2.punchCount > 0) status = 'INCOMPLETE';
      else if (status === 'ABSENT' && worked > 0) status = 'OK';
      else if (status === 'INCOMPLETE' && worked > 0) status = 'OK';
      else if (!['LEAVE', 'HOLIDAY', 'ADJUSTED'].includes(status)) status = 'OK';
    }

    const prev = {
      worked: Number(dayRow?.worked_minutes ?? 0),
      absence: Number(dayRow?.absence_minutes ?? 0),
      ot: Number(dayRow?.overtime_minutes ?? 0),
      break: Number(dayRow?.break_minutes ?? 0),
    };
    const changed =
      !dayRow ||
      prev.worked !== worked ||
      prev.absence !== absence ||
      prev.ot !== ot ||
      plan.toIgnore.length > 0 ||
      plan.toClear.length > 0;

    if (!changed) continue;

    empChanges++;
    report.push({
      name: emp.name,
      date,
      action: DRY ? 'WOULD_UPDATE' : 'UPDATED',
      from: `${prev.worked}m w / ${prev.absence}m abs`,
      to: `${worked}m w / ${absence}m abs / +${ot}m ot`,
      clearAuto: plan.toClear.length,
      ignoreAuto: plan.toIgnore.length,
      pairs: calc2.pairs,
    });

    if (DRY) continue;

    if (!dayRow) {
      // Need period — skip create here; only update existing rows
      continue;
    }

    const { error: ue } = await sb
      .from('timesheet_days')
      .update({
        worked_minutes: worked,
        break_minutes: breakMinutes,
        overtime_minutes: ot,
        absence_minutes: absence,
        early_out_minutes: 0,
        first_punch_at: calc2.first || null,
        last_punch_at: calc2.last || null,
        status,
        updated: new Date().toISOString(),
      })
      .eq('id', dayRow.id);
    if (ue) {
      console.error('update fail', emp.name, date, ue.message);
      continue;
    }

    const { data: ledger } = await sb
      .from('hour_bank_ledger')
      .select('id,entry_type')
      .eq('timesheet_day_id', dayRow.id);
    for (const e of ledger || []) {
      if (e.entry_type === 'OT_CREDIT' || e.entry_type === 'ABSENCE_DEBIT') {
        await sb.from('hour_bank_ledger').delete().eq('id', e.id);
      }
    }
    if (ot > 0) {
      await sb.from('hour_bank_ledger').insert({
        organization_id: dayRow.organization_id,
        employee_id: pis,
        entry_date: date,
        minutes_delta: ot,
        entry_type: 'OT_CREDIT',
        timesheet_day_id: dayRow.id,
        period_id: dayRow.period_id,
        notes: 'Auto OT credit',
      });
    } else if (absence > 0 && status === 'ABSENT') {
      await sb.from('hour_bank_ledger').insert({
        organization_id: dayRow.organization_id,
        employee_id: pis,
        entry_date: date,
        minutes_delta: -absence,
        entry_type: 'ABSENCE_DEBIT',
        timesheet_day_id: dayRow.id,
        period_id: dayRow.period_id,
        notes: 'Auto absence debit',
      });
    }
  }

  if (empChanges > 0) {
    console.log(`… ${emp.name}: ${empChanges} dia(s)`);
  }
}

const updated = report.filter((r) => r.action === 'UPDATED' || r.action === 'WOULD_UPDATE');
const skipped = report.filter((r) => r.action === 'SKIP_ADJUSTED');
console.log('\n=== RESUMO ===');
console.log(DRY ? 'DRY-RUN' : 'APLICADO');
console.log(`Dias ADJUSTED preservados: ${skipped.length}`);
console.log(`Dias recalculados: ${updated.length}`);
console.log('\nDetalhe (recalc):');
for (const r of updated) {
  console.log(
    `${r.name} | ${r.date} | ${r.from} → ${r.to} | clearAuto=${r.clearAuto} ignore=${r.ignoreAuto} pairs=${r.pairs}`,
  );
}
