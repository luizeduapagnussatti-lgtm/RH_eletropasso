/**
 * Clock tolerance (10 min) on calculateDay: late, shortfall, overtime.
 * Run: npx vite-node scripts/test-timesheet-clock-tolerance.mjs
 */
import assert from 'node:assert/strict';
import {
  applyJourneyThreshold,
  calculateDay,
  CLOCK_TOLERANCE_MINUTES,
} from '../src/services/timeCalculation.service.ts';

assert.equal(CLOCK_TOLERANCE_MINUTES, 10);
assert.equal(applyJourneyThreshold(0), 0);
assert.equal(applyJourneyThreshold(5), 0);
assert.equal(applyJourneyThreshold(9), 0);
assert.equal(applyJourneyThreshold(10), 10);
assert.equal(applyJourneyThreshold(12), 12);

const shift = {
  id: 's1',
  name: 'Comercial',
  startTime: '08:00',
  endTime: '17:00',
  lateGracePeriod: 5,
  earlyOutGracePeriod: 15,
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  breakDurationMinutes: 60,
  expectedDailyMinutes: 480,
  organizationId: 'o1',
  isDefault: true,
};

function punches(date, hms) {
  return hms.map((hm, i) => ({
    id: String(i + 1),
    punchedAt: `${date}T${hm}:00-03:00`,
    direction: i % 2 === 0 ? 'IN' : 'OUT',
    ignoredForCalc: false,
    employeeId: 'e1',
    organizationId: 'o1',
    source: 'CLOCK',
  }));
}

const ctx = { shift, isHoliday: false, onApprovedLeave: false };
const date = '2026-07-15';

{
  const r = calculateDay({
    date,
    punches: punches(date, ['08:05', '12:00', '13:00', '17:00']),
    ...ctx,
  });
  assert.equal(r.lateMinutes, 0, '5 min late ignored');
  assert.equal(r.absenceMinutes, 0, '5 min shortfall ignored');
  assert.notEqual(r.status, 'LATE');
}

{
  const r = calculateDay({
    date,
    punches: punches(date, ['08:00', '12:00', '13:00', '17:03']),
    ...ctx,
  });
  assert.equal(r.overtimeMinutes, 0, '3 min OT ignored');
}

{
  const r = calculateDay({
    date,
    punches: punches(date, ['08:00', '12:00', '13:00', '17:12']),
    ...ctx,
  });
  assert.equal(r.overtimeMinutes, 12, '12 min OT counts in full');
}

{
  const r = calculateDay({ date, punches: [], ...ctx });
  assert.equal(r.status, 'ABSENT');
  assert.equal(r.absenceMinutes, 480, 'no-punch day keeps full expected absence');
}

{
  const r = calculateDay({
    date,
    punches: punches(date, ['08:15', '12:00', '13:00', '17:00']),
    ...ctx,
  });
  assert.equal(r.lateMinutes, 5, '15 min late → 5 after 10 min tolerance');
  assert.equal(r.absenceMinutes, 15, '15 min shortfall counts in full');
}

console.log('timesheet clock tolerance OK');
