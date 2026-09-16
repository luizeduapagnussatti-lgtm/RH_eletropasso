/**
 * Roster past-day outcome (worked / absent / off).
 * Run: node scripts/test-roster-day-outcome.mjs
 */
import assert from 'node:assert/strict';

function punchLocalDateKey(punchedAt) {
  const d = new Date(punchedAt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isRosterEligible(emp) {
  if (emp.status === 'INACTIVE') return false;
  return emp.includeInRoster === true;
}

function isPjContractor(emp) {
  return String(emp.employmentType || '').toUpperCase() === 'PJ';
}

function personKeys(emp) {
  const keys = [];
  const push = (s) => {
    if (s && !keys.includes(s)) keys.push(s);
  };
  push((emp.id || '').trim());
  const pis = String(emp.employeeId || '').replace(/\D/g, '');
  if (pis) {
    push(emp.employeeId);
    push(pis);
    push(pis.padStart(12, '0'));
  }
  const cred = String(emp.clockCredential || '').replace(/\D/g, '');
  if (cred) {
    push(emp.clockCredential);
    push(cred.padStart(12, '0'));
  }
  return keys;
}

function punchLookupKeys(employeeId) {
  const raw = String(employeeId || '').trim();
  const keys = [];
  const push = (s) => {
    if (s && !keys.includes(s)) keys.push(s);
  };
  push(raw);
  const digits = raw.replace(/\D/g, '');
  if (digits) {
    push(digits);
    push(digits.padStart(12, '0'));
  }
  return keys;
}

function buildRosterDayOutcome({ employees, assignments, punches, workDate }) {
  const team = employees.filter(e => isRosterEligible(e));
  const dayRows = assignments.filter(a => a.workDate === workDate);
  if (dayRows.length === 0) {
    return { worked: [], absent: [], off: [], published: false };
  }

  const keyToPersonId = new Map();
  for (const emp of team) {
    for (const k of personKeys(emp)) keyToPersonId.set(k, emp.id);
  }

  const punchesByPerson = new Map();
  for (const p of punches) {
    if (p.ignoredForCalc) continue;
    if (punchLocalDateKey(p.punchedAt) !== workDate) continue;
    const personId = punchLookupKeys(p.employeeId).map(k => keyToPersonId.get(k)).find(Boolean);
    if (!personId) continue;
    const list = punchesByPerson.get(personId) || [];
    list.push(p);
    punchesByPerson.set(personId, list);
  }

  const worked = [];
  const absent = [];
  const off = [];

  for (const emp of team) {
    const keys = new Set(personKeys(emp));
    const hit = dayRows.find(r => keys.has(r.employeeId));
    const status = hit?.status ?? 'OFF';
    const personPunches = (punchesByPerson.get(emp.id) || [])
      .slice()
      .sort((a, b) => new Date(a.punchedAt) - new Date(b.punchedAt));

    if (status === 'OFF') {
      off.push({ id: emp.id, name: emp.name });
      continue;
    }
    if (personPunches.length > 0) {
      worked.push({
        id: emp.id,
        name: emp.name,
        firstAt: personPunches[0].punchedAt,
        lastAt: personPunches[personPunches.length - 1].punchedAt,
        punchCount: personPunches.length,
      });
    } else if (isPjContractor(emp)) {
      worked.push({ id: emp.id, name: emp.name, punchCount: 0, pjNoClock: true });
    } else {
      absent.push({ id: emp.id, name: emp.name });
    }
  }

  return { worked, absent, off, published: true };
}

const workDate = '2026-09-05';
const t1 = new Date(2026, 8, 5, 8, 2, 0).toISOString();
const t2 = new Date(2026, 8, 5, 17, 41, 0).toISOString();

const employees = [
  { id: 'a', name: 'Ana', employeeId: '100', includeInRoster: true },
  { id: 'b', name: 'Bruno', employeeId: '101', includeInRoster: true },
  { id: 'c', name: 'Carla', employeeId: '102', includeInRoster: true },
  { id: 'd', name: 'Diego', employeeId: '103', includeInRoster: false },
  { id: 'e', name: 'Eva', employeeId: '104', includeInRoster: true, employmentType: 'PJ' },
];

const assignments = [
  { workDate, employeeId: 'a', status: 'WORK' },
  { workDate, employeeId: '100', status: 'WORK' }, // same person via badge — status already WORK
  { workDate, employeeId: 'b', status: 'WORK' },
  { workDate, employeeId: 'c', status: 'OFF' },
  { workDate, employeeId: 'e', status: 'WORK' },
];

const punches = [
  { employeeId: '100', punchedAt: t1, ignoredForCalc: false },
  { employeeId: 'a', punchedAt: t2, ignoredForCalc: false },
  { employeeId: '101', punchedAt: t1, ignoredForCalc: true },
];

const result = buildRosterDayOutcome({ employees, assignments, punches, workDate });
assert.equal(result.published, true);
assert.equal(result.worked.length, 2);
assert.equal(result.worked[0].name, 'Ana');
assert.equal(result.worked[0].punchCount, 2);
assert.equal(result.absent.length, 1);
assert.equal(result.absent[0].name, 'Bruno');
assert.equal(result.off.length, 1);
assert.equal(result.off[0].name, 'Carla');
assert.equal(result.worked.some(p => p.name === 'Eva' && p.pjNoClock), true);

const padded = buildRosterDayOutcome({
  employees: [{ id: 'u1', name: 'Luis', employeeId: '020160839763', includeInRoster: true }],
  assignments: [{ workDate, employeeId: 'u1', status: 'WORK' }],
  punches: [{ employeeId: '20160839763', punchedAt: t1, ignoredForCalc: false }],
  workDate,
});
assert.equal(padded.worked.length, 1);
assert.equal(padded.worked[0].name, 'Luis');

const unpublished = buildRosterDayOutcome({
  employees,
  assignments: [],
  punches,
  workDate,
});
assert.equal(unpublished.published, false);
assert.equal(unpublished.worked.length, 0);
assert.equal(unpublished.absent.length, 0);

/** Past-date guard for saveDay / copyMonth / swap approve */
function assertWritableRosterDate(workDateIso, todayIso) {
  if (workDateIso < todayIso) throw new Error('rosterPastDate');
}

assert.throws(() => assertWritableRosterDate('2026-09-05', '2026-09-16'), /rosterPastDate/);
assert.doesNotThrow(() => assertWritableRosterDate('2026-09-16', '2026-09-16'));
assert.doesNotThrow(() => assertWritableRosterDate('2026-09-19', '2026-09-16'));

/** copyMonth skips past target saturdays */
function filterCopyTargets(targetDates, todayIso) {
  return targetDates.filter(d => d >= todayIso);
}
assert.deepEqual(
  filterCopyTargets(['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26'], '2026-09-16'),
  ['2026-09-19', '2026-09-26'],
);

console.log('✅ roster day outcome tests passed.');
