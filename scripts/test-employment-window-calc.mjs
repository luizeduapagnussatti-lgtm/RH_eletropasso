/**
 * Pure unit checks for employment-window timesheet calc.
 * Run: npx vite-node scripts/test-employment-window-calc.mjs
 */
import assert from 'node:assert/strict';
import {
  calculateDay,
  isOutsideEmploymentWindow,
} from '../src/services/timeCalculation.service.ts';
import { isTimesheetExempt } from '../src/utils/roles.ts';

// Timesheet-exempt: system/admin/diretoria never accrue balance; HR + operational
// roles are tracked (HR assistant punches in this deployment).
assert.equal(isTimesheetExempt('ADMIN'), true);
assert.equal(isTimesheetExempt('SUPER_ADMIN'), true);
assert.equal(isTimesheetExempt('MANAGEMENT'), true);
assert.equal(isTimesheetExempt('HR'), false);
assert.equal(isTimesheetExempt('MANAGER'), false);
assert.equal(isTimesheetExempt('TEAM_LEAD'), false);
assert.equal(isTimesheetExempt('EMPLOYEE'), false);
assert.equal(isTimesheetExempt(undefined), false);

assert.equal(isOutsideEmploymentWindow('2026-07-20', '2026-07-21', undefined), true);
assert.equal(isOutsideEmploymentWindow('2026-07-21', '2026-07-21', undefined), false);
assert.equal(isOutsideEmploymentWindow('2026-07-22', undefined, '2026-07-21'), true);
assert.equal(isOutsideEmploymentWindow('2026-07-21', undefined, '2026-07-21'), false);

const preHire = calculateDay({
  date: '2026-07-20',
  punches: [],
  shift: {
    id: 's1',
    name: 'Default',
    startTime: '08:00',
    endTime: '17:00',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    expectedDailyMinutes: 480,
  },
  isHoliday: false,
  onApprovedLeave: false,
  joiningDate: '2026-07-21',
});
assert.equal(preHire.status, 'OFF');
assert.equal(preHire.expectedMinutes, 0);
assert.equal(preHire.absenceMinutes, 0);

const postTerm = calculateDay({
  date: '2026-07-22',
  punches: [],
  shift: preHire.shiftId
    ? {
        id: 's1',
        name: 'Default',
        startTime: '08:00',
        endTime: '17:00',
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        expectedDailyMinutes: 480,
      }
    : {
        id: 's1',
        name: 'Default',
        startTime: '08:00',
        endTime: '17:00',
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        expectedDailyMinutes: 480,
      },
  isHoliday: false,
  onApprovedLeave: false,
  terminationDate: '2026-07-21',
});
assert.equal(postTerm.status, 'OFF');
assert.equal(postTerm.absenceMinutes, 0);

console.log('employment-window calc OK');
