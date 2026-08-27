/**
 * Timesheet staff scope: ativos vs histórico de demitidos na competência.
 * Run: npx vite-node scripts/test-timesheet-scope.mjs
 */
import assert from 'node:assert/strict';
import {
  clockStaffInCompetence,
  isActiveClockStaffInCompetence,
  isDismissedInCompetence,
  pendingDutyAckDays,
} from '../src/utils/timesheetScope.ts';

const period = { startDate: '2026-07-26', endDate: '2026-08-25' };

function emp(over) {
  return {
    id: 'p1',
    email: 'a@b.c',
    name: 'Colaborador',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    department: 'Ops',
    designation: 'Aux',
    employmentType: 'PERMANENT',
    joiningDate: '2020-01-01',
    ...over,
  };
}

const active = emp({ id: 'a1', name: 'Ativo', employeeId: '10' });
const dismissedIn = emp({
  id: 'd1',
  name: 'Gustavo',
  employeeId: '20',
  status: 'INACTIVE',
  terminationDate: '2026-08-10',
});
const dismissedBefore = emp({
  id: 'd0',
  name: 'Saiu antes',
  employeeId: '21',
  status: 'INACTIVE',
  terminationDate: '2026-07-20',
});
const dismissedOnStart = emp({
  id: 'd2',
  name: 'Último dia = início',
  employeeId: '22',
  status: 'INACTIVE',
  terminationDate: '2026-07-26',
});
const hiredAfter = emp({
  id: 'h1',
  name: 'Admissão futura',
  employeeId: '23',
  joiningDate: '2026-08-26',
});
const pjDismissed = emp({
  id: 'pj1',
  name: 'PJ',
  employeeId: '98',
  status: 'INACTIVE',
  employmentType: 'PJ',
  terminationDate: '2026-08-10',
});

assert.equal(isActiveClockStaffInCompetence(active, period), true, 'ACTIVE stays in live queue');
assert.equal(isDismissedInCompetence(active, period), false);

assert.equal(isActiveClockStaffInCompetence(dismissedIn, period), false, 'INACTIVE not in live queue');
assert.equal(isDismissedInCompetence(dismissedIn, period), true, 'term inside competence → history');

assert.equal(isActiveClockStaffInCompetence(dismissedBefore, period), false);
assert.equal(isDismissedInCompetence(dismissedBefore, period), false, 'term before start → neither');

assert.equal(isDismissedInCompetence(dismissedOnStart, period), true, 'last day on period start still overlaps');

assert.equal(isActiveClockStaffInCompetence(hiredAfter, period), false);
assert.equal(isDismissedInCompetence(hiredAfter, period), false);

assert.equal(isDismissedInCompetence(pjDismissed, period), false, 'PJ exempt from history clock list');
assert.equal(isActiveClockStaffInCompetence(pjDismissed, period), false);

const staff = clockStaffInCompetence(
  [active, dismissedIn, dismissedBefore, hiredAfter, pjDismissed],
  period,
);
assert.deepEqual(
  staff.map(e => e.id).sort(),
  ['a1', 'd1'],
  'clock staff = overlapping ativos + demitidos, not exempt / out of window',
);

const days = [
  { workDate: '2026-08-08', status: 'OK', managerAck: true },
  { workDate: '2026-08-09', status: 'OFF', managerAck: false },
  { workDate: '2026-08-10', status: 'LATE', managerAck: false },
  { workDate: '2026-08-11', status: 'ABSENT', managerAck: false },
  { workDate: '2026-08-07', status: 'LEAVE', managerAck: false },
  { workDate: '2026-08-06', status: 'HOLIDAY', managerAck: false },
];
const pending = pendingDutyAckDays(days, { untilDate: '2026-08-10' });
assert.deepEqual(
  pending.map(d => d.workDate),
  ['2026-08-10'],
  'only duty days without ack up to last work day (skips OFF/LEAVE/HOLIDAY and days after term)',
);

console.log('test-timesheet-scope: ok');
