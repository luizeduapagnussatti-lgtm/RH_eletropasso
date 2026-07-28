/**
 * Pure unit checks: absence sync, proximity auto-ignore, slots with ignored punches.
 * Run: npx vite-node scripts/test-timesheet-punch-adjust.mjs
 */
import assert from 'node:assert/strict';
import { syncAbsenceFromWorked } from '../src/utils/timesheetAdjust.ts';
import {
  pairPunchesToSlots,
  planProximityAutoIgnores,
  consolidatePunchesForDay,
  PUNCH_PROXIMITY_DEDUP_MINUTES,
} from '../src/services/punch.service.ts';

assert.equal(syncAbsenceFromWorked(480, 480), 0);
assert.equal(syncAbsenceFromWorked(480, 240), 240);
assert.equal(syncAbsenceFromWorked(480, 500), 0);
assert.equal(syncAbsenceFromWorked(0, 100), 0);

// Display helper: ADJUSTED derives Falta from worked even if stored absence is stale
import { displayAbsenceMinutes } from '../src/utils/timesheetDisplay.ts';
assert.equal(
  displayAbsenceMinutes({
    status: 'ADJUSTED',
    expectedMinutes: 480,
    workedMinutes: 480,
    absenceMinutes: 251, // stale
  }),
  0,
);
assert.equal(
  displayAbsenceMinutes({
    status: 'OK',
    expectedMinutes: 480,
    workedMinutes: 240,
    absenceMinutes: 240,
  }),
  240,
);

assert.equal(PUNCH_PROXIMITY_DEDUP_MINUTES, 10);

const date = '2026-07-08';
const mk = (id, hm, extra = {}) => ({
  id,
  employeeId: 'e1',
  punchedAt: `2026-07-08T${hm}:00.000-03:00`,
  direction: 'IN',
  source: 'CLOCK',
  ...extra,
});

const punches = [
  mk('a', '07:45'),
  mk('b', '07:55'),
  mk('c', '11:47', { direction: 'OUT' }),
  mk('d', '13:22', { direction: 'IN' }),
];

const plan = planProximityAutoIgnores(punches, date);
assert.deepEqual(plan.toIgnore, ['b']);
assert.deepEqual(plan.toClear, []);

const withAuto = punches.map(p =>
  p.id === 'b' ? { ...p, ignoredForCalc: true, ignoreSource: 'AUTO' } : p,
);
const plan2 = planProximityAutoIgnores(withAuto, date);
assert.deepEqual(plan2.toIgnore, []);
assert.deepEqual(plan2.toClear, []);

const managerKept = punches.map(p =>
  p.id === 'b' ? { ...p, ignoredForCalc: false, ignoreSource: 'MANUAL' } : p,
);
const plan3 = planProximityAutoIgnores(managerKept, date);
assert.deepEqual(plan3.toIgnore, []);
assert.ok(!plan3.toIgnore.includes('b'));

const slots = pairPunchesToSlots(
  punches.map(p => (p.id === 'b' ? { ...p, ignoredForCalc: true, ignoreSource: 'AUTO' } : p)),
  date,
);
assert.equal(slots.entry1?.includes('07:45'), true);
assert.equal(slots.exit1?.includes('11:47'), true);
assert.equal(slots.entry2?.includes('13:22'), true);
assert.equal(slots.exit2, undefined);

const summary = consolidatePunchesForDay(
  punches.map(p => (p.id === 'b' ? { ...p, ignoredForCalc: true, ignoreSource: 'AUTO' } : p)),
  date,
);
assert.equal(summary.firstIn?.includes('07:45'), true);
assert.equal(summary.punches.length, 3);

console.log('timesheet punch adjust OK');
