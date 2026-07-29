/**
 * Coherence: totals always derived from punches; approval blocked when incoherent.
 * Run: npx vite-node scripts/test-timesheet-coherence.mjs
 */
import assert from 'node:assert/strict';
import { calculateDay } from '../src/services/timeCalculation.service.ts';
import {
  buildDayCoherenceContext,
  checkDayCoherence,
  isAuditOnlyManualAdjustment,
} from '../src/utils/timesheetDayCoherence.ts';
import { isDayApprovable } from '../src/utils/timesheetDayAckValidation.ts';

const shiftMonFri = {
  id: 's1',
  name: 'Comercial',
  startTime: '08:00',
  endTime: '17:00',
  lateGracePeriod: 10,
  earlyOutGracePeriod: 0,
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  breakDurationMinutes: 60,
  organizationId: 'o1',
  isDefault: true,
};

const fourPunches = [
  { id: '1', punchedAt: '2026-07-15T08:00:00-03:00', direction: 'IN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
  { id: '2', punchedAt: '2026-07-15T12:00:00-03:00', direction: 'OUT', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
  { id: '3', punchedAt: '2026-07-15T13:00:00-03:00', direction: 'IN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
  { id: '4', punchedAt: '2026-07-15T17:00:00-03:00', direction: 'OUT', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
];

const ctx = {
  shift: shiftMonFri,
  isHoliday: false,
  onApprovedLeave: false,
};

{
  const result = calculateDay({
    date: '2026-07-15',
    punches: fourPunches,
    ...ctx,
  });
  assert.ok(result.workedMinutes >= 0);
  assert.equal(result.overtimeMinutes, Math.max(0, result.workedMinutes - result.expectedMinutes));
  assert.equal(result.absenceMinutes, Math.max(0, result.expectedMinutes - result.workedMinutes));
}

{
  // Legacy manual override stored wrong worked — coherence detects
  const computed = calculateDay({
    date: '2026-07-15',
    punches: fourPunches,
    ...ctx,
  });
  const storedDay = {
    workDate: '2026-07-15',
    employeeId: 'e1',
    expectedMinutes: computed.expectedMinutes,
    workedMinutes: computed.workedMinutes + 120, // inflated like Yandi case
    breakMinutes: computed.breakMinutes,
    lateMinutes: computed.lateMinutes,
    earlyOutMinutes: computed.earlyOutMinutes,
    overtimeMinutes: computed.overtimeMinutes,
    nightMinutes: computed.nightMinutes,
    absenceMinutes: computed.absenceMinutes,
    status: computed.status,
  };
  const { coherent, diffs } = checkDayCoherence(storedDay, fourPunches, ctx);
  assert.equal(coherent, false);
  assert.ok(diffs.some(d => d.field === 'workedMinutes'));
}

{
  const computed = calculateDay({
    date: '2026-07-15',
    punches: fourPunches,
    ...ctx,
  });
  const day = {
    id: 'd1',
    organizationId: 'o1',
    periodId: 'p1',
    employeeId: 'e1',
    workDate: '2026-07-15',
    expectedMinutes: computed.expectedMinutes,
    workedMinutes: computed.workedMinutes + 60,
    breakMinutes: computed.breakMinutes,
    lateMinutes: computed.lateMinutes,
    earlyOutMinutes: computed.earlyOutMinutes,
    overtimeMinutes: computed.overtimeMinutes,
    nightMinutes: computed.nightMinutes,
    absenceMinutes: computed.absenceMinutes,
    status: computed.status,
    calcVersion: 1,
    employeeAck: false,
    managerAck: false,
  };
  const coherenceCtx = buildDayCoherenceContext(day, {
    shift: shiftMonFri,
    holidays: [],
    leaves: [],
  });
  const v = isDayApprovable(day, fourPunches, coherenceCtx);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'incoherentTotals');
}

{
  const computed = calculateDay({
    date: '2026-07-15',
    punches: fourPunches,
    ...ctx,
  });
  const day = {
    id: 'd1',
    organizationId: 'o1',
    periodId: 'p1',
    employeeId: 'e1',
    workDate: '2026-07-15',
    ...computed,
    calcVersion: 1,
    employeeAck: false,
    managerAck: false,
    status: computed.status,
  };
  const coherenceCtx = buildDayCoherenceContext(day, {
    shift: shiftMonFri,
    holidays: [],
    leaves: [],
  });
  const { coherent } = checkDayCoherence(day, fourPunches, coherenceCtx);
  assert.equal(coherent, true);
  assert.equal(isDayApprovable(day, fourPunches, coherenceCtx).ok, true);
}

{
  // Future workday with no punches must never be ABSENT nor debit the bank.
  const future = calculateDay({
    date: '2026-07-20',
    punches: [],
    ...ctx,
    asOfDate: '2026-07-15',
  });
  assert.notEqual(future.status, 'ABSENT');
  assert.equal(future.absenceMinutes, 0);
  assert.equal(future.expectedMinutes, 0);

  // Same shape today (no punches) is still ABSENT on a working day.
  const todayNoPunch = calculateDay({
    date: '2026-07-15',
    punches: [],
    ...ctx,
    asOfDate: '2026-07-15',
  });
  assert.equal(todayNoPunch.status, 'ABSENT');
  assert.ok(todayNoPunch.absenceMinutes > 0);
}

assert.equal(isAuditOnlyManualAdjustment({ remarks: 'test', editedAt: '2026-01-01' }), true);
assert.equal(isAuditOnlyManualAdjustment({ workedMinutes: 480 }), false);

/** Pure repair decision: incoherent → needs recalc */
function needsRecalc(stored, punches, coherenceCtx) {
  return !checkDayCoherence(stored, punches, coherenceCtx).coherent;
}

{
  const computed = calculateDay({ date: '2026-07-15', punches: fourPunches, ...ctx });
  const stored = { ...computed, workDate: '2026-07-15', employeeId: 'e1', workedMinutes: 999 };
  assert.equal(needsRecalc(stored, fourPunches, ctx), true);
  assert.equal(needsRecalc({ ...computed, workDate: '2026-07-15', employeeId: 'e1' }, fourPunches, ctx), false);
}

console.log('OK — test-timesheet-coherence passed');
