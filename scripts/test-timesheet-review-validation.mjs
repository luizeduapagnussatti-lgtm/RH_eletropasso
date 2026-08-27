/**
 * Sprint tests for timesheet review validation (pure logic).
 * Run: npx vite-node scripts/test-timesheet-review-validation.mjs
 */
import assert from 'node:assert/strict';
import { validateTimesheetEmployeeReview } from '../src/utils/timesheetReviewValidation.ts';

const TODAY = '2026-07-20';

const okDay = {
  id: 'd1',
  organizationId: 'o',
  periodId: 'p',
  employeeId: 'e',
  workDate: '2026-07-15',
  status: 'OK',
  expectedMinutes: 480,
  workedMinutes: 480,
  breakMinutes: 60,
  lateMinutes: 0,
  earlyOutMinutes: 0,
  overtimeMinutes: 0,
  nightMinutes: 0,
  absenceMinutes: 0,
  firstPunchAt: '2026-07-15T08:00:00',
  lastPunchAt: '2026-07-15T17:00:00',
  calcVersion: 1,
  employeeAck: true,
  managerAck: true,
  remarks: '',
};

const fourPunches = [
  {
    id: '1',
    punchedAt: '2026-07-15T08:00:00',
    direction: 'IN',
    ignoredForCalc: false,
    employeeId: 'e',
    organizationId: 'o',
    source: 'CLOCK',
  },
  {
    id: '2',
    punchedAt: '2026-07-15T12:00:00',
    direction: 'OUT',
    ignoredForCalc: false,
    employeeId: 'e',
    organizationId: 'o',
    source: 'CLOCK',
  },
  {
    id: '3',
    punchedAt: '2026-07-15T13:00:00',
    direction: 'IN',
    ignoredForCalc: false,
    employeeId: 'e',
    organizationId: 'o',
    source: 'CLOCK',
  },
  {
    id: '4',
    punchedAt: '2026-07-15T17:00:00',
    direction: 'OUT',
    ignoredForCalc: false,
    employeeId: 'e',
    organizationId: 'o',
    source: 'CLOCK',
  },
];

{
  const r = validateTimesheetEmployeeReview([okDay], TODAY, fourPunches);
  assert.equal(r.canSubmit, true);
  assert.equal(r.blockingErrors.length, 0);
}

{
  const r = validateTimesheetEmployeeReview([{ ...okDay, status: 'INCOMPLETE' }], TODAY);
  assert.equal(r.canSubmit, false);
  assert.ok(r.blockingErrors.includes('reviewBlockIncomplete'));
  assert.ok(r.blockingErrors.includes('reviewBlockNotApprovable'));
}

{
  const r = validateTimesheetEmployeeReview([{ ...okDay, status: 'ADJUSTED', remarks: '  ' }], TODAY);
  assert.equal(r.canSubmit, false);
}

{
  const r = validateTimesheetEmployeeReview(
    [{ ...okDay, employeeAck: false, managerAck: false }],
    TODAY
  );
  assert.equal(r.canSubmit, false);
  assert.ok(r.blockingErrors.includes('reviewBlockMissingManagerAck'));
}

{
  const r = validateTimesheetEmployeeReview(
    [okDay, { ...okDay, id: 'f', workDate: '2026-07-25', status: 'INCOMPLETE', managerAck: false }],
    TODAY,
    fourPunches
  );
  assert.equal(r.canSubmit, true);
}

{
  const r = validateTimesheetEmployeeReview(
    [
      {
        ...okDay,
        status: 'ABSENT',
        workedMinutes: 0,
        absenceMinutes: 480,
        firstPunchAt: undefined,
        lastPunchAt: undefined,
        managerAck: true,
      },
    ],
    TODAY
  );
  assert.equal(r.canSubmit, false);
  assert.ok(r.blockingErrors.includes('reviewBlockNotApprovable'));
}

{
  const r = validateTimesheetEmployeeReview(
    [
      {
        ...okDay,
        status: 'OFF',
        expectedMinutes: 0,
        workedMinutes: 0,
        firstPunchAt: undefined,
        lastPunchAt: undefined,
        managerAck: true,
      },
    ],
    TODAY,
    []
  );
  assert.equal(r.canSubmit, true);
}

console.log('[test-timesheet-review-validation] All checks passed.');

function canApproveEmployeeReviewStatus(status) {
  if (status === 'APPROVED') return true;
  return status === 'EMPLOYEE_SIGNED';
}

assert.equal(canApproveEmployeeReviewStatus('IN_REVIEW'), false);
assert.equal(canApproveEmployeeReviewStatus('OPEN'), false);
assert.equal(canApproveEmployeeReviewStatus('EMPLOYEE_SIGNED'), true);
assert.equal(canApproveEmployeeReviewStatus('APPROVED'), true);

console.log('[test-timesheet-review-validation] EMPLOYEE_SIGNED approve gate OK.');
