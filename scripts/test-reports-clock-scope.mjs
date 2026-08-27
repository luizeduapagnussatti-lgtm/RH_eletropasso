/**
 * Reports clock scope: PJ on roster must not inflate absences.
 * Run: npx vite-node scripts/test-reports-clock-scope.mjs
 */
import assert from 'node:assert/strict';
import { calculateEmployeeSummaries, ALL_EMPLOYEES_FILTER } from '../src/utils/attendanceUtils.ts';
import { topEmployeesByAbsentDays } from '../src/utils/reportMetrics.ts';
import {
  isClockReportEmployee,
  isPayrollExcluded,
  isRosterEligible,
} from '../src/utils/roles.ts';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const shift = {
  id: 's1',
  name: 'Default',
  startTime: '08:00',
  endTime: '17:00',
  lateGracePeriod: 10,
  earlyOutGracePeriod: 10,
  earliestCheckIn: '07:00',
  autoSessionCloseTime: '19:00',
  workingDays: weekdays,
  isDefault: true,
};

const appConfig = {
  companyName: 'T',
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  dateFormat: 'DD/MM/YYYY',
  workingDays: weekdays,
  officeStartTime: '08:00',
  officeEndTime: '17:00',
  lateGracePeriod: 10,
  earlyOutGracePeriod: 10,
};

function baseEmp(over) {
  return {
    email: 'x@example.com',
    department: 'Vendas',
    designation: 'Consultor',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    joiningDate: '2020-01-01',
    includeInRoster: true,
    shiftId: 's1',
    ...over,
  };
}

const pj = baseEmp({
  id: 'pj1',
  name: 'Gustavo PJ',
  employeeId: '98',
  employmentType: 'PJ',
});

const clt = baseEmp({
  id: 'clt1',
  name: 'Maria CLT',
  employeeId: '10',
  employmentType: 'PERMANENT',
});

const hr = baseEmp({
  id: 'hr1',
  name: 'Auxiliar RH',
  employeeId: '11',
  role: 'HR',
  employmentType: 'PERMANENT',
});

assert.equal(isRosterEligible(pj), true, 'PJ stays on roster');
assert.equal(isClockReportEmployee(pj), false, 'PJ does not punch');
assert.equal(isPayrollExcluded(pj), true, 'PJ stays out of detailed gap');
assert.equal(isClockReportEmployee(clt), true);
assert.equal(isClockReportEmployee(hr), true, 'HR assistant still clocks in');
assert.equal(isClockReportEmployee({ ...clt, status: 'INACTIVE' }), false);

const startDate = '2026-08-03';
const endDate = '2026-08-07';
const selectedDepts = ['Vendas'];

function summariesFor(employees) {
  return calculateEmployeeSummaries({
    employees,
    consolidatedAttendance: [],
    approvedLeaves: [],
    shifts: [shift],
    shiftOverrides: [],
    appConfig,
    holidays: [],
    startDate,
    endDate,
    selectedDepts,
    employeeFilter: ALL_EMPLOYEES_FILTER,
  });
}

const unfiltered = summariesFor([pj, clt]);
const pjRow = unfiltered.find(s => s.employeeId === 'pj1');
assert.ok(pjRow, 'without clock filter, PJ would appear');
assert.ok(pjRow.absentDays > 0, 'PJ with no punches would count every weekday as absence');

const clockEmployees = [pj, clt, hr].filter(e => isClockReportEmployee(e));
assert.equal(clockEmployees.some(e => e.id === 'pj1'), false);

const filtered = summariesFor(clockEmployees);
assert.equal(filtered.some(s => s.employeeId === 'pj1'), false, 'PJ out of summaries');

const cltRow = filtered.find(s => s.employeeId === 'clt1');
assert.ok(cltRow, 'CLT stays in summaries');
assert.ok(cltRow.absentDays > 0, 'CLT without punches still counts absences');

assert.ok(filtered.some(s => s.employeeId === 'hr1'), 'HR assistant remains');

const top = topEmployeesByAbsentDays(filtered);
assert.equal(top.some(s => s.employeeId === 'pj1'), false, 'PJ out of Top ausências');
assert.ok(top.some(s => s.employeeId === 'clt1'), 'CLT can appear in Top ausências');

console.log('reports clock scope OK');
