/**
 * Saturday roster-gated timesheet calc.
 * Run: npx vite-node scripts/test-roster-saturday-calc.mjs
 */
import assert from 'node:assert/strict';
import { calculateDay } from '../src/services/timeCalculation.service.ts';
import { rosterStatusFromAssignments } from '../src/services/roster.service.ts';

const shiftSat = {
  id: 's1',
  name: 'Comercial',
  startTime: '08:00',
  endTime: '11:45',
  lateGracePeriod: 5,
  earlyOutGracePeriod: 0,
  earliestCheckIn: '06:00',
  autoSessionCloseTime: '23:59',
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  breakDurationMinutes: 0,
  expectedDailyMinutes: 225,
};

const asOf = '2026-08-27';
const saturday = '2026-08-01';
const monday = '2026-07-27';

const unpublishedSat = calculateDay({
  date: saturday,
  punches: [],
  shift: shiftSat,
  isHoliday: false,
  onApprovedLeave: false,
  rosterStatus: null,
  asOfDate: asOf,
});
assert.equal(unpublishedSat.status, 'OFF', 'unpublished Saturday is OFF');
assert.equal(unpublishedSat.expectedMinutes, 0);
assert.equal(unpublishedSat.absenceMinutes, 0);

const rosteredWork = calculateDay({
  date: saturday,
  punches: [],
  shift: shiftSat,
  isHoliday: false,
  onApprovedLeave: false,
  rosterStatus: 'WORK',
  asOfDate: asOf,
});
assert.equal(rosteredWork.status, 'ABSENT', 'rostered Saturday without punches is ABSENT');
assert.equal(rosteredWork.expectedMinutes, 225);
assert.equal(rosteredWork.absenceMinutes, 225);

const rosteredOff = calculateDay({
  date: saturday,
  punches: [],
  shift: shiftSat,
  isHoliday: false,
  onApprovedLeave: false,
  rosterStatus: 'OFF',
  asOfDate: asOf,
});
assert.equal(rosteredOff.status, 'OFF');
assert.equal(rosteredOff.expectedMinutes, 0);
assert.equal(rosteredOff.absenceMinutes, 0);

const mondayNull = calculateDay({
  date: monday,
  punches: [],
  shift: shiftSat,
  isHoliday: false,
  onApprovedLeave: false,
  rosterStatus: null,
  asOfDate: asOf,
});
assert.equal(mondayNull.status, 'ABSENT', 'weekday still uses workingDays when roster is null');
assert.equal(mondayNull.expectedMinutes > 0, true);
assert.equal(mondayNull.absenceMinutes > 0, true);

assert.equal(rosterStatusFromAssignments([], ['e1']), null);
assert.equal(
  rosterStatusFromAssignments(
    [{ id: 'a', workDate: saturday, employeeId: 'e1', status: 'WORK', dayKind: 'SATURDAY' }],
    ['e1'],
  ),
  'WORK',
);
assert.equal(
  rosterStatusFromAssignments(
    [{ id: 'a', workDate: saturday, employeeId: 'e2', status: 'WORK', dayKind: 'SATURDAY' }],
    ['e1'],
  ),
  'OFF',
);

console.log('roster saturday calc OK');
