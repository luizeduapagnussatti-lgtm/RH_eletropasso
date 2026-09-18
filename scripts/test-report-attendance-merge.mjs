/**
 * Reports attendance merge: PTRP timesheet wins over legacy selfie.
 * Run: node scripts/test-report-attendance-merge.mjs
 */
import assert from 'node:assert/strict';

function mergeAttendanceSources(legacy, fromTimesheet) {
  const map = new Map();
  for (const row of legacy) {
    map.set(`${row.employeeId}_${row.date}`, row);
  }
  for (const row of fromTimesheet) {
    map.set(`${row.employeeId}_${row.date}`, row);
  }
  return Array.from(map.values());
}

function isPtrpAttendanceRow(row) {
  return String(row.remarks || '').startsWith('PTRP:');
}

const legacy = [
  {
    id: 'leg-1',
    employeeId: 'emp-a',
    date: '2026-09-10',
    status: 'PRESENT',
    remarks: 'selfie',
  },
];
const ptrp = [
  {
    id: 'ptrp-1',
    employeeId: 'emp-a',
    date: '2026-09-10',
    status: 'LATE',
    remarks: 'PTRP:LATE',
  },
  {
    id: 'ptrp-2',
    employeeId: 'emp-b',
    date: '2026-09-11',
    status: 'PRESENT',
    remarks: 'PTRP:OK',
  },
];

const merged = mergeAttendanceSources(legacy, ptrp);
const byKey = Object.fromEntries(merged.map((r) => [`${r.employeeId}_${r.date}`, r]));

assert.equal(byKey['emp-a_2026-09-10'].status, 'LATE');
assert.equal(byKey['emp-a_2026-09-10'].remarks, 'PTRP:LATE');
assert.equal(byKey['emp-b_2026-09-11'].status, 'PRESENT');
assert.equal(isPtrpAttendanceRow(byKey['emp-a_2026-09-10']), true);

const onlyLegacy = mergeAttendanceSources(
  [{ id: 'l', employeeId: 'emp-c', date: '2026-09-12', status: 'PRESENT', remarks: 'x' }],
  [],
);
assert.equal(onlyLegacy.length, 1);
assert.equal(onlyLegacy[0].employeeId, 'emp-c');

console.log('test-report-attendance-merge: ok');
