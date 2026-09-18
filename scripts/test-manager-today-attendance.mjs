/**
 * Manager today attendance grouping.
 * Run: node scripts/test-manager-today-attendance.mjs
 */
import assert from 'node:assert/strict';

function punchLocalDateKey(punchedAt) {
  const d = new Date(punchedAt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isDutyDayNeedingAck(status) {
  if (!status) return true;
  return !['OFF', 'HOLIDAY', 'LEAVE'].includes(status);
}

function buildManagerTodayAttendance({ team, punches, today, todayDays = [] }) {
  const dayByEmployeeKey = new Map();
  for (const d of todayDays) {
    if (d.workDate !== today) continue;
    dayByEmployeeKey.set(d.employeeId, d);
  }

  const keyToPersonId = new Map();
  for (const emp of team) {
    keyToPersonId.set(emp.id, emp.id);
    if (emp.employeeId) keyToPersonId.set(emp.employeeId, emp.id);
  }

  const punchesByPerson = new Map();
  for (const p of punches) {
    if (p.ignoredForCalc) continue;
    if (punchLocalDateKey(p.punchedAt) !== today) continue;
    const personId = keyToPersonId.get(p.employeeId);
    if (!personId) continue;
    const list = punchesByPerson.get(personId) || [];
    list.push(p);
    punchesByPerson.set(personId, list);
  }

  const present = [];
  const missing = [];
  const offDuty = [];

  for (const emp of team) {
    const day = dayByEmployeeKey.get(emp.id) || dayByEmployeeKey.get(emp.employeeId);
    const isOff = day ? !isDutyDayNeedingAck(day.status) : false;
    const personPunches = (punchesByPerson.get(emp.id) || []).slice().sort(
      (a, b) => new Date(a.punchedAt) - new Date(b.punchedAt),
    );

    if (personPunches.length > 0) {
      present.push({
        id: emp.id,
        name: emp.name,
        firstAt: personPunches[0].punchedAt,
        lastAt: personPunches[personPunches.length - 1].punchedAt,
        punchCount: personPunches.length,
      });
    } else if (isOff) {
      offDuty.push({ id: emp.id, name: emp.name });
    } else {
      missing.push({ id: emp.id, name: emp.name });
    }
  }

  return { present, missing, offDuty, teamCount: team.length };
}

const today = '2026-09-16';
// Use local noon ISO so punchLocalDateKey matches regardless of TZ offset.
const t1 = new Date(2026, 8, 16, 8, 2, 0).toISOString();
const t2 = new Date(2026, 8, 16, 17, 41, 0).toISOString();
const tIgnored = new Date(2026, 8, 16, 9, 0, 0).toISOString();

const team = [
  { id: 'a', name: 'Ana', employeeId: '100' },
  { id: 'b', name: 'Bruno', employeeId: '101' },
  { id: 'c', name: 'Carla', employeeId: '102' },
];

const punches = [
  { employeeId: '100', punchedAt: t1, ignoredForCalc: false },
  { employeeId: 'a', punchedAt: t2, ignoredForCalc: false },
  { employeeId: '101', punchedAt: tIgnored, ignoredForCalc: true },
];

const todayDays = [
  { employeeId: 'c', workDate: today, status: 'OFF' },
];

const result = buildManagerTodayAttendance({ team, punches, today, todayDays });

assert.equal(result.teamCount, 3);
assert.equal(result.present.length, 1);
assert.equal(result.present[0].name, 'Ana');
assert.equal(result.present[0].punchCount, 2);
assert.equal(result.missing.length, 1);
assert.equal(result.missing[0].name, 'Bruno');
assert.equal(result.offDuty.length, 1);
assert.equal(result.offDuty[0].name, 'Carla');

console.log('✅ manager today attendance tests passed.');
