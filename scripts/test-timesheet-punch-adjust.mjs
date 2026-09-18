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
assert.equal(syncAbsenceFromWorked(480, 475), 0);
assert.equal(syncAbsenceFromWorked(480, 470), 10);

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
    status: 'OFF',
    expectedMinutes: 0,
    workedMinutes: 0,
    absenceMinutes: 480, // stale / wrong
  }),
  0,
);
assert.equal(
  displayAbsenceMinutes({
    status: 'HOLIDAY',
    expectedMinutes: 0,
    workedMinutes: 0,
    absenceMinutes: 100,
  }),
  0,
);
assert.equal(
  displayAbsenceMinutes({
    status: 'INCOMPLETE',
    expectedMinutes: 480,
    workedMinutes: 225,
    absenceMinutes: 255,
  }),
  0,
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

// Org-wide list must NOT treat coworker punches as proximity duplicates.
const coworkerCluster = [
  mk('a1', '07:45', { employeeId: 'emp-A' }),
  mk('b1', '07:50', { employeeId: 'emp-B' }), // within 10 min of emp-A, different person
  mk('a2', '12:00', { employeeId: 'emp-A', direction: 'OUT' }),
  mk('b2', '12:05', { employeeId: 'emp-B', direction: 'OUT' }),
];
const planCoworker = planProximityAutoIgnores(coworkerCluster, date);
assert.deepEqual(planCoworker.toIgnore, [], 'must not ignore across employees');
assert.deepEqual(planCoworker.toClear, []);

const slots = pairPunchesToSlots(
  punches.map(p => (p.id === 'b' ? { ...p, ignoredForCalc: true, ignoreSource: 'AUTO' } : p)),
  date,
);
// AUTO-ignored still appear in display slots (only MANUAL ignore hides).
assert.equal(slots.entry1?.includes('07:45'), true);
assert.equal(slots.exit1?.includes('07:55'), true);
assert.equal(slots.entry2?.includes('11:47'), true);
assert.equal(slots.exit2?.includes('13:22'), true);

const slotsManualIgnore = pairPunchesToSlots(
  punches.map(p => (p.id === 'b' ? { ...p, ignoredForCalc: true, ignoreSource: 'MANUAL' } : p)),
  date,
);
assert.equal(slotsManualIgnore.entry1?.includes('07:45'), true);
assert.equal(slotsManualIgnore.exit1?.includes('11:47'), true);
assert.equal(slotsManualIgnore.entry2?.includes('13:22'), true);
assert.equal(slotsManualIgnore.exit2, undefined);

const summary = consolidatePunchesForDay(
  punches.map(p => (p.id === 'b' ? { ...p, ignoredForCalc: true, ignoreSource: 'AUTO' } : p)),
  date,
);
assert.equal(summary.firstIn?.includes('07:45'), true);
assert.equal(summary.punches.length, 3); // calc still excludes ignored

import { resolvePdfManagerName } from '../src/services/timesheetPdfExport.service.ts';

const employees = [
  { id: 'anelise', name: 'Anelise', employeeId: 'p1', status: 'ACTIVE' },
  { id: 'gisele', name: 'Gisele Olibone', employeeId: 'p2', status: 'ACTIVE' },
];
const periodDays = [{ workDate: '2026-07-28', employeeId: 'e1' }];
assert.equal(
  resolvePdfManagerName({
    periodDays,
    punches: [
      {
        id: 'm1',
        employeeId: 'e1',
        punchedAt: '2026-07-28T11:45:00-03:00',
        direction: 'OUT',
        source: 'MANUAL',
        rawPayload: { createdBy: 'anelise' },
      },
    ],
    employees,
    review: null,
    exportedBy: { id: 'gisele', name: 'Gisele Olibone' },
    lineManagerName: 'Gisele Olibone',
  }),
  'Anelise',
  'latest manual punch editor wins over line manager',
);
assert.equal(
  resolvePdfManagerName({
    periodDays,
    punches: [],
    employees,
    review: null,
    exportedBy: { id: 'anelise', name: 'Anelise' },
    lineManagerName: 'Gisele Olibone',
  }),
  'Anelise',
  'exporter wins when no punch audit',
);

import {
  resolveShiftDay,
  resolveExpectedDailyMinutes,
  FULL_JOURNEY_MIN_EXPECTED_MINUTES,
} from '../src/services/timeCalculation.service.ts';

assert.equal(FULL_JOURNEY_MIN_EXPECTED_MINUTES, 360);
assert.equal(
  resolveExpectedDailyMinutes({
    startTime: '08:00',
    endTime: '11:45',
    breakDurationMinutes: 0,
    storedExpected: 240,
  }),
  225,
  'meio turno uses clock span over wrong half-of-8h expected',
);
assert.equal(
  resolveShiftDay(
    {
      id: 's1',
      name: 'Meio',
      startTime: '08:00',
      endTime: '11:45',
      lateGracePeriod: 5,
      earlyOutGracePeriod: 0,
      earliestCheckIn: '06:00',
      autoSessionCloseTime: '23:59',
      workingDays: ['Monday'],
      breakDurationMinutes: 0,
      expectedDailyMinutes: 240,
    },
    '2026-07-27',
  ).expectedDailyMinutes,
  225,
);
assert.equal(
  resolveExpectedDailyMinutes({
    startTime: '08:00',
    endTime: '17:00',
    breakDurationMinutes: 60,
    storedExpected: 480,
  }),
  480,
  'full journey keeps stored expected',
);
assert.equal(
  resolveShiftDay(
    {
      id: 's2',
      name: 'Cheio',
      startTime: '08:00',
      endTime: '17:00',
      lateGracePeriod: 5,
      earlyOutGracePeriod: 0,
      earliestCheckIn: '06:00',
      autoSessionCloseTime: '23:59',
      workingDays: ['Monday'],
      breakDurationMinutes: 60,
      expectedDailyMinutes: 480,
    },
    '2026-07-27',
  ).expectedDailyMinutes,
  480,
);

console.log('timesheet punch adjust OK');
