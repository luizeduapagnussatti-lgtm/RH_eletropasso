/**
 * UI must treat "4 punches + 8h falta" as stale even when firstPunchAt is set
 * (APP lunch), so opening the espelho self-heals without waiting for the queue.
 *
 * Run: npx vite-node scripts/test-timesheet-day-stale.mjs
 */
import assert from 'node:assert/strict';
import { staleTimesheetWorkDates, timesheetDayNeedsRecalc } from '../src/utils/timesheetDayStale.ts';

const date = '2026-09-01';
const mk = (id, hm, source) => ({
  id,
  employeeId: '012491638543',
  punchedAt: `${date}T${hm}:00.000-03:00`,
  direction: 'UNKNOWN',
  source,
  ignoredForCalc: false,
});

const live = [
  mk('clk-in', '07:53', 'CLOCK'),
  mk('app-out', '12:02', 'APP'),
  mk('app-in', '13:19', 'APP'),
  mk('clk-out', '17:44', 'CLOCK'),
];

{
  const staleAppOnly = {
    workDate: date,
    firstPunchAt: `${date}T12:02:00.000-03:00`,
    lastPunchAt: `${date}T13:19:00.000-03:00`,
    workedMinutes: 0,
  };
  assert.equal(timesheetDayNeedsRecalc(staleAppOnly, live, date), true);
  assert.deepEqual(staleTimesheetWorkDates([staleAppOnly], live), [date]);
}

{
  const afterRecalc = {
    workDate: date,
    firstPunchAt: `${date}T07:53:00.000-03:00`,
    lastPunchAt: `${date}T17:44:00.000-03:00`,
    workedMinutes: 514,
  };
  assert.equal(timesheetDayNeedsRecalc(afterRecalc, live, date), false);
  assert.deepEqual(staleTimesheetWorkDates([afterRecalc], live), []);
}

{
  assert.equal(timesheetDayNeedsRecalc(undefined, live, date), true);
  assert.equal(timesheetDayNeedsRecalc({ firstPunchAt: live[0].punchedAt, workedMinutes: 0 }, live, date), true);
}

console.log('test-timesheet-day-stale: ok');
