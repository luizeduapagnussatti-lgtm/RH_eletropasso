/**
 * Mixed APP + CLOCK punches (PWA lunch + REP entry/exit) must credit the day.
 * Repro: Douglas 2026-09-01 showed 4 punches on the grid but 0 worked / 8h absence
 * because timesheet_days was last saved from APP-only recalc.
 *
 * Run: npx vite-node scripts/test-timesheet-app-clock-mix.mjs
 */
import assert from 'node:assert/strict';
import { calculateDay } from '../src/services/timeCalculation.service.ts';
import { planAppVsClockIgnores } from '../src/services/punch.service.ts';

const date = '2026-09-01';
const shift = {
  id: 's1',
  name: 'Comercial',
  startTime: '08:00',
  endTime: '17:44',
  lateGracePeriod: 10,
  earlyOutGracePeriod: 10,
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  breakDurationMinutes: 60,
  expectedDailyMinutes: 480,
  organizationId: 'o1',
  isDefault: true,
};

const mk = (id, hm, source, direction = 'UNKNOWN') => ({
  id,
  employeeId: '012491638543',
  organizationId: 'o1',
  punchedAt: `${date}T${hm}:00.000-03:00`,
  direction,
  source,
  ignoredForCalc: false,
});

const punches = [
  mk('clk-in', '07:53', 'CLOCK', 'UNKNOWN'),
  mk('app-lunch-out', '12:02', 'APP', 'IN'),
  mk('app-lunch-in', '13:19', 'APP', 'OUT'),
  mk('clk-out', '17:44', 'CLOCK', 'UNKNOWN'),
];

{
  const plan = planAppVsClockIgnores(punches, date);
  assert.deepEqual(plan.toIgnore, [], 'APP lunch is outside 10 min of CLOCK — keep all');
}

{
  const r = calculateDay({
    date,
    punches,
    shift,
    isHoliday: false,
    onApprovedLeave: false,
  });
  assert.ok(r.workedMinutes >= 500, `worked should be ~8h34 got ${r.workedMinutes}`);
  assert.equal(r.absenceMinutes, 0, `must not book 8h absence, got ${r.absenceMinutes}`);
  assert.notEqual(r.status, 'ABSENT');
  assert.ok(r.firstPunchAt?.includes('07:53') || r.firstPunchAt?.includes('10:53'));
}

{
  const d2 = '2026-09-02';
  const punches2 = [
    mk('c1', '08:03', 'CLOCK', 'UNKNOWN'),
    mk('a1', '11:45', 'APP', 'IN'),
    mk('a2', '12:57', 'APP', 'OUT'),
    mk('a3', '18:03', 'APP', 'IN'),
  ].map((p) => ({ ...p, punchedAt: p.punchedAt.replace('2026-09-01', d2) }));
  const r = calculateDay({
    date: d2,
    punches: punches2,
    shift,
    isHoliday: false,
    onApprovedLeave: false,
  });
  assert.ok(r.workedMinutes >= 500, `02/09 mixed should be ~8h48 got ${r.workedMinutes}`);
  assert.equal(r.absenceMinutes, 0, `02/09 must not show 3h26 absence, got ${r.absenceMinutes}`);
}

{
  const appOnly = punches.filter(p => p.source === 'APP');
  const r = calculateDay({
    date,
    punches: appOnly,
    shift,
    isHoliday: false,
    onApprovedLeave: false,
  });
  assert.ok(r.workedMinutes < 120, 'APP-only lunch pair must not look like a full day');
}

{
  const d10 = '2026-09-10';
  const midShift = [
    mk('in', '07:53', 'APP', 'IN'),
    mk('lunch-out', '11:58', 'APP', 'OUT'),
    mk('lunch-in', '13:23', 'APP', 'IN'),
  ].map((p) => ({ ...p, punchedAt: p.punchedAt.replace('2026-09-01', d10) }));
  const r = calculateDay({
    date: d10,
    punches: midShift,
    shift,
    isHoliday: false,
    onApprovedLeave: false,
  });
  assert.equal(r.status, 'INCOMPLETE');
  assert.equal(r.absenceMinutes, 0, 'open 3-punch day must not book remaining hours as falta');
}

console.log('test-timesheet-app-clock-mix: ok');
