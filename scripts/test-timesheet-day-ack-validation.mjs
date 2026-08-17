/**
 * Validation tests for timesheet day manager_ack + PDF gate + OFF calc.
 * Run: npx vite-node scripts/test-timesheet-day-ack-validation.mjs
 */
import assert from 'node:assert/strict';
import {
  isDayApprovable,
  partitionApprovableDays,
  canExportMirrorPdf,
} from '../src/utils/timesheetDayAckValidation.ts';
import { calculateDay, isWorkingDay } from '../src/services/timeCalculation.service.ts';

function baseDay(over = {}) {
  return {
    id: over.id || 'd1',
    organizationId: 'o1',
    periodId: 'p1',
    employeeId: 'e1',
    workDate: over.workDate || '2026-07-15',
    expectedMinutes: over.expectedMinutes ?? 480,
    workedMinutes: over.workedMinutes ?? 480,
    breakMinutes: 60,
    lateMinutes: 0,
    earlyOutMinutes: 0,
    overtimeMinutes: 0,
    nightMinutes: 0,
    absenceMinutes: over.absenceMinutes ?? 0,
    status: over.status || 'OK',
    firstPunchAt: over.firstPunchAt,
    lastPunchAt: over.lastPunchAt,
    calcVersion: 1,
    employeeAck: false,
    managerAck: over.managerAck ?? false,
    remarks: over.remarks,
  };
}

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

assert.equal(isDayApprovable(baseDay({ status: 'OFF', expectedMinutes: 0 })).ok, true);
assert.equal(isDayApprovable(baseDay({ status: 'HOLIDAY', expectedMinutes: 0 })).ok, true);
assert.equal(isDayApprovable(baseDay({ status: 'LEAVE', expectedMinutes: 0 })).ok, true);
assert.equal(isDayApprovable(baseDay({ status: 'OK', expectedMinutes: 0 })).ok, true);

{
  const v = isDayApprovable(baseDay({ status: 'ABSENT', workedMinutes: 0, absenceMinutes: 480 }));
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'absent');
}

{
  const v = isDayApprovable(
    baseDay({
      status: 'ABSENT',
      workedMinutes: 0,
      absenceMinutes: 480,
      remarks: 'Não compareceu — atestado será anexado',
    })
  );
  assert.equal(v.ok, true);
}

{
  const v = isDayApprovable(
    baseDay({
      status: 'INCOMPLETE',
      firstPunchAt: '2026-07-15T08:00:00',
      workedMinutes: 0,
    })
  );
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'incomplete');
}

const fourPunches = [
  { id: '1', punchedAt: '2026-07-15T08:00:00', direction: 'IN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
  { id: '2', punchedAt: '2026-07-15T12:00:00', direction: 'OUT', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
  { id: '3', punchedAt: '2026-07-15T13:00:00', direction: 'IN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
  { id: '4', punchedAt: '2026-07-15T17:00:00', direction: 'OUT', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
];

assert.equal(
  isDayApprovable(
    baseDay({
      status: 'OK',
      firstPunchAt: '2026-07-15T08:00:00',
      lastPunchAt: '2026-07-15T17:00:00',
    }),
    fourPunches
  ).ok,
  true
);

{
  // Full journey with only 2 punches must block
  const two = [
    { id: '1', punchedAt: '2026-07-15T08:00:00', direction: 'IN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
    { id: '2', punchedAt: '2026-07-15T17:00:00', direction: 'OUT', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
  ];
  const v = isDayApprovable(
    baseDay({
      status: 'OK',
      expectedMinutes: 480,
      firstPunchAt: '2026-07-15T08:00:00',
      lastPunchAt: '2026-07-15T17:00:00',
    }),
    two
  );
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'needFourPunches');
}

{
  // Half-day (expected < 360) still OK with 2 punches
  const two = [
    { id: '1', punchedAt: '2026-07-15T08:00:00', direction: 'IN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
    { id: '2', punchedAt: '2026-07-15T12:00:00', direction: 'OUT', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
  ];
  assert.equal(
    isDayApprovable(
      baseDay({
        status: 'OK',
        expectedMinutes: 240,
        workedMinutes: 240,
        firstPunchAt: '2026-07-15T08:00:00',
        lastPunchAt: '2026-07-15T12:00:00',
      }),
      two
    ).ok,
    true
  );
}

{
  // Full journey without punch list cannot approve (first/last alone insufficient)
  const v = isDayApprovable(
    baseDay({
      status: 'OK',
      expectedMinutes: 480,
      firstPunchAt: '2026-07-15T08:00:00',
      lastPunchAt: '2026-07-15T17:00:00',
    })
  );
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'needFourPunches');
}

{
  // 3 punches (missing saída 2) must block even if first/last exist
  const three = [
    { id: '1', punchedAt: '2026-07-02T08:02:00', direction: 'IN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
    { id: '2', punchedAt: '2026-07-02T11:47:00', direction: 'OUT', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
    { id: '3', punchedAt: '2026-07-02T13:44:00', direction: 'IN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
  ];
  const v = isDayApprovable(
    baseDay({
      workDate: '2026-07-02',
      status: 'OK',
      firstPunchAt: '2026-07-02T08:02:00',
      lastPunchAt: '2026-07-02T13:44:00',
    }),
    three
  );
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'incomplete');
}

{
  const result = calculateDay({
    date: '2026-07-02',
    punches: [
      { id: '1', punchedAt: '2026-07-02T08:02:00-03:00', direction: 'UNKNOWN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
      { id: '2', punchedAt: '2026-07-02T11:47:00-03:00', direction: 'UNKNOWN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
      { id: '3', punchedAt: '2026-07-02T13:44:00-03:00', direction: 'UNKNOWN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
    ],
    shift: shiftMonFri,
    isHoliday: false,
    onApprovedLeave: false,
  });
  assert.equal(result.status, 'INCOMPLETE');
}

{
  const v = isDayApprovable(baseDay({ status: 'OK', firstPunchAt: undefined, lastPunchAt: undefined }));
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'needFourPunches');
}

assert.equal(
  isDayApprovable(
    baseDay({
      status: 'LATE',
      firstPunchAt: '2026-07-15T08:30:00',
      lastPunchAt: '2026-07-15T17:00:00',
    }),
    [
      { id: '1', punchedAt: '2026-07-15T08:30:00', direction: 'IN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
      { id: '2', punchedAt: '2026-07-15T12:00:00', direction: 'OUT', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
      { id: '3', punchedAt: '2026-07-15T13:00:00', direction: 'IN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
      { id: '4', punchedAt: '2026-07-15T17:00:00', direction: 'OUT', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
    ]
  ).ok,
  true
);

assert.equal(
  isDayApprovable(
    baseDay({
      status: 'ADJUSTED',
      remarks: 'Ajuste RH',
      firstPunchAt: '2026-07-15T08:00:00',
      lastPunchAt: '2026-07-15T17:00:00',
    }),
    fourPunches
  ).ok,
  true
);
{
  const v = isDayApprovable(baseDay({ status: 'ADJUSTED', remarks: '  ' }));
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'adjustedNoRemarks');
}
{
  // Hour-only ADJUSTED without punches must not approve
  const v = isDayApprovable(
    baseDay({
      status: 'ADJUSTED',
      remarks: 'esqueceu',
      expectedMinutes: 480,
      workedMinutes: 480,
      firstPunchAt: undefined,
      lastPunchAt: undefined,
    })
  );
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'needFourPunches');
}
{
  // Sunday noted as ADJUSTED rest — ok without punches
  assert.equal(
    isDayApprovable(
      baseDay({
        status: 'ADJUSTED',
        remarks: 'domingo',
        expectedMinutes: 0,
        workedMinutes: 0,
        firstPunchAt: undefined,
        lastPunchAt: undefined,
      })
    ).ok,
    true
  );
}

{
  const days = [
    baseDay({ id: 'a', status: 'OFF', expectedMinutes: 0, managerAck: false }),
    baseDay({ id: 'b', status: 'ABSENT', workedMinutes: 0 }),
    baseDay({
      id: 'c',
      status: 'OK',
      firstPunchAt: '2026-07-15T08:00:00',
      lastPunchAt: '2026-07-15T17:00:00',
    }),
  ];
  const { approvable, blocked } = partitionApprovableDays(days);
  // Full-journey day without punch list is not approvable (needFourPunches)
  assert.equal(approvable.length, 1);
  assert.equal(approvable[0].id, 'a');
  assert.equal(blocked.length, 2);
}

{
  const today = '2026-07-20';
  const pending = [
    baseDay({
      workDate: '2026-07-15',
      managerAck: true,
      firstPunchAt: '2026-07-15T08:00:00',
      lastPunchAt: '2026-07-15T17:00:00',
    }),
    baseDay({
      id: 'x',
      workDate: '2026-07-16',
      managerAck: false,
      firstPunchAt: '2026-07-16T08:00:00',
      lastPunchAt: '2026-07-16T17:00:00',
    }),
  ];
  const gate = canExportMirrorPdf(pending, today);
  assert.equal(gate.ok, false);
  assert.equal(gate.pendingCount, 1);

  const allAcked = pending.map(d => ({ ...d, managerAck: true }));
  assert.equal(canExportMirrorPdf(allAcked, today).ok, true);

  const withFuture = [
    ...allAcked,
    baseDay({
      id: 'f',
      workDate: '2026-07-25',
      managerAck: false,
      status: 'ABSENT',
      workedMinutes: 0,
    }),
  ];
  assert.equal(canExportMirrorPdf(withFuture, today).ok, true);
}

assert.equal(isWorkingDay('2026-07-26', shiftMonFri.workingDays), false);
{
  const result = calculateDay({
    date: '2026-07-26',
    punches: [],
    shift: shiftMonFri,
    isHoliday: false,
    onApprovedLeave: false,
  });
  assert.equal(result.status, 'OFF');
  assert.equal(result.absenceMinutes, 0);
  assert.equal(result.expectedMinutes, 0);
}

{
  const result = calculateDay({
    date: '2026-07-15',
    punches: [],
    shift: shiftMonFri,
    isHoliday: true,
    onApprovedLeave: false,
  });
  assert.equal(result.status, 'HOLIDAY');
  assert.equal(result.absenceMinutes, 0);
}

{
  const result = calculateDay({
    date: '2026-07-15',
    punches: [],
    shift: shiftMonFri,
    isHoliday: false,
    onApprovedLeave: false,
  });
  assert.equal(result.status, 'ABSENT');
  assert.ok(result.absenceMinutes > 0);
}

{
  // Full journey with only entrada+saída (2 punches) → INCOMPLETE
  const result = calculateDay({
    date: '2026-07-15',
    punches: [
      { id: '1', punchedAt: '2026-07-15T08:00:00-03:00', direction: 'UNKNOWN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
      { id: '2', punchedAt: '2026-07-15T17:00:00-03:00', direction: 'UNKNOWN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
    ],
    shift: shiftMonFri,
    isHoliday: false,
    onApprovedLeave: false,
  });
  assert.equal(result.status, 'INCOMPLETE');
}

{
  const result = calculateDay({
    date: '2026-07-15',
    punches: [
      { id: '1', punchedAt: '2026-07-15T08:00:00-03:00', direction: 'UNKNOWN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
      { id: '2', punchedAt: '2026-07-15T12:00:00-03:00', direction: 'UNKNOWN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
      { id: '3', punchedAt: '2026-07-15T13:00:00-03:00', direction: 'UNKNOWN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
      { id: '4', punchedAt: '2026-07-15T17:00:00-03:00', direction: 'UNKNOWN', ignoredForCalc: false, employeeId: 'e1', organizationId: 'o1', source: 'CLOCK' },
    ],
    shift: shiftMonFri,
    isHoliday: false,
    onApprovedLeave: false,
  });
  assert.ok(result.status === 'OK' || result.status === 'LATE');
}

{
  // Incoherent stored totals block approval when coherence context provided
  const computed = calculateDay({
    date: '2026-07-15',
    punches: fourPunches,
    shift: shiftMonFri,
    isHoliday: false,
    onApprovedLeave: false,
  });
  const incoherentDay = baseDay({
    status: computed.status,
    expectedMinutes: computed.expectedMinutes,
    workedMinutes: computed.workedMinutes + 90,
    breakMinutes: computed.breakMinutes,
    lateMinutes: computed.lateMinutes,
    overtimeMinutes: computed.overtimeMinutes,
    absenceMinutes: computed.absenceMinutes,
    firstPunchAt: '2026-07-15T08:00:00',
    lastPunchAt: '2026-07-15T17:00:00',
  });
  const coherenceCtx = { shift: shiftMonFri, isHoliday: false, onApprovedLeave: false };
  const vInc = isDayApprovable(incoherentDay, fourPunches, coherenceCtx);
  assert.equal(vInc.ok, false);
  assert.equal(vInc.reason, 'incoherentTotals');
}

console.log('OK — test-timesheet-day-ack-validation passed');
