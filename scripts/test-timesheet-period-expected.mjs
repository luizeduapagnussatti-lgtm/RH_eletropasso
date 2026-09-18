/**
 * Period expected-minutes projection (pure).
 * Run: npx vite-node scripts/test-timesheet-period-expected.mjs
 */
import assert from 'node:assert/strict';
import {
  projectExpectedMinutesForDate,
  sumPeriodExpectedMinutes,
} from '../src/utils/timesheetPeriodExpected.ts';

const shift = {
  id: 's1',
  name: 'Comercial',
  organizationId: 'o',
  startTime: '08:00',
  endTime: '17:00',
  breakDurationMinutes: 60,
  expectedDailyMinutes: 480,
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  isDefault: true,
  active: true,
  lateGracePeriod: 10,
  earlyOutGracePeriod: 10,
};

{
  // Weekday with shift → 8h
  assert.equal(
    projectExpectedMinutesForDate({
      date: '2026-08-27', // Thursday
      shift,
      rosterStatus: null,
      isHoliday: false,
      onApprovedLeave: false,
    }),
    480,
  );
}

{
  // Saturday without roster → 0
  assert.equal(
    projectExpectedMinutesForDate({
      date: '2026-08-29',
      shift,
      rosterStatus: null,
      isHoliday: false,
      onApprovedLeave: false,
    }),
    0,
  );
}

{
  // Saturday roster WORK → 8h
  assert.equal(
    projectExpectedMinutesForDate({
      date: '2026-08-29',
      shift,
      rosterStatus: 'WORK',
      isHoliday: false,
      onApprovedLeave: false,
    }),
    480,
  );
}

{
  // Holiday without WORK roster → 0
  assert.equal(
    projectExpectedMinutesForDate({
      date: '2026-09-07',
      shift,
      rosterStatus: null,
      isHoliday: true,
      onApprovedLeave: false,
    }),
    0,
  );
}

{
  // Existing day uses stored expected; future Mon projects 480
  const total = sumPeriodExpectedMinutes({
    startDate: '2026-08-26',
    endDate: '2026-08-31',
    days: [
      {
        id: 'd1',
        organizationId: 'o',
        periodId: 'p',
        employeeId: 'e',
        workDate: '2026-08-26',
        status: 'OK',
        expectedMinutes: 480,
        workedMinutes: 480,
        breakMinutes: 60,
        lateMinutes: 0,
        earlyOutMinutes: 0,
        overtimeMinutes: 0,
        nightMinutes: 0,
        absenceMinutes: 0,
        calcVersion: 1,
        employeeAck: false,
        managerAck: false,
        remarks: '',
      },
    ],
    employee: { id: 'uuid', shiftId: 's1' },
    employeeKeys: ['e', 'uuid'],
    shifts: [shift],
    overrides: [],
    rosterRows: [],
    holidays: [],
    leaves: [],
  });
  // Wed 26 stored 480; Thu–Fri + Mon project 480×3; Sat/Sun 0 → 1920
  assert.equal(total, 1920);
}

console.log('[test-timesheet-period-expected] All checks passed.');
