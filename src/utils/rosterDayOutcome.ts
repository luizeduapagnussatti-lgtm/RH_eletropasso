import type { Employee, Punch, RosterAssignmentStatus, WorkRosterAssignment } from '../types';
import { isPjContractor, isRosterEligible } from './roles';
import { punchLocalDateKey } from '../services/punch.service';
import { normalizeClockCredential, normalizePis } from './employeeCredentials';

export type RosterDayPerson = {
  id: string;
  name: string;
  department?: string;
  employeeId?: string;
  firstAt?: string;
  lastAt?: string;
  punchCount: number;
  pjNoClock?: boolean;
};

export type RosterDayOutcome = {
  worked: RosterDayPerson[];
  absent: RosterDayPerson[];
  off: RosterDayPerson[];
  published: boolean;
};

/** Local HH:mm from ISO timestamptz. */
export function formatPunchHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = iso.match(/T(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : '—';
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function personKeys(emp: Employee): string[] {
  const keys: string[] = [];
  const push = (v?: string | null) => {
    const s = (v || '').trim();
    if (s && !keys.includes(s)) keys.push(s);
  };
  push(emp.id);
  push(emp.employeeId);
  push(normalizePis(emp.employeeId));
  push(emp.clockCredential);
  push(normalizeClockCredential(emp.clockCredential));
  return keys;
}

function punchLookupKeys(employeeId: string): string[] {
  const raw = String(employeeId || '').trim();
  const keys: string[] = [];
  const push = (v?: string | null) => {
    const s = (v || '').trim();
    if (s && !keys.includes(s)) keys.push(s);
  };
  push(raw);
  const digits = raw.replace(/\D/g, '');
  if (digits) {
    push(digits);
    push(digits.padStart(12, '0'));
    push(normalizePis(raw));
    push(normalizeClockCredential(raw));
  }
  return keys;
}

function personIdForPunch(
  punchEmployeeId: string,
  keyToPersonId: Map<string, string>,
): string | undefined {
  for (const k of punchLookupKeys(punchEmployeeId)) {
    const id = keyToPersonId.get(k);
    if (id) return id;
  }
  return undefined;
}

function resolveRosterStatus(
  emp: Employee,
  rows: WorkRosterAssignment[],
): RosterAssignmentStatus | null {
  if (rows.length === 0) return null;
  const keys = new Set(personKeys(emp));
  const hit = rows.find(r => keys.has(r.employeeId));
  return hit?.status ?? 'OFF';
}

/**
 * Past roster day outcome for manager Escalas history.
 * No assignment rows → unpublished (no invented absences).
 * WORK + punches → worked; WORK + no punches → absent; OFF → off.
 * PJ on WORK never counts as absence (they do not punch the clock).
 */
export function buildRosterDayOutcome(opts: {
  employees: Employee[];
  assignments: WorkRosterAssignment[];
  punches: Punch[];
  workDate: string;
}): RosterDayOutcome {
  const { employees, assignments, punches, workDate } = opts;
  const team = employees.filter(e => isRosterEligible(e));
  const dayRows = assignments.filter(a => a.workDate === workDate);

  if (dayRows.length === 0) {
    return { worked: [], absent: [], off: [], published: false };
  }

  const keyToPersonId = new Map<string, string>();
  for (const emp of team) {
    for (const k of personKeys(emp)) keyToPersonId.set(k, emp.id);
  }

  const punchesByPerson = new Map<string, Punch[]>();
  for (const p of punches) {
    if (p.ignoredForCalc) continue;
    if (punchLocalDateKey(p.punchedAt) !== workDate) continue;
    const personId = personIdForPunch(p.employeeId, keyToPersonId);
    if (!personId) continue;
    const list = punchesByPerson.get(personId) || [];
    list.push(p);
    punchesByPerson.set(personId, list);
  }

  const worked: RosterDayPerson[] = [];
  const absent: RosterDayPerson[] = [];
  const off: RosterDayPerson[] = [];

  for (const emp of team) {
    const status = resolveRosterStatus(emp, dayRows);
    if (!status) continue;

    const personPunches = (punchesByPerson.get(emp.id) || [])
      .slice()
      .sort((a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime());

    const base: RosterDayPerson = {
      id: emp.id,
      name: emp.name,
      department: emp.department || undefined,
      employeeId: emp.employeeId || undefined,
      punchCount: personPunches.length,
    };

    if (status === 'OFF') {
      off.push(base);
      continue;
    }

    if (personPunches.length > 0) {
      worked.push({
        ...base,
        firstAt: personPunches[0]!.punchedAt,
        lastAt: personPunches[personPunches.length - 1]!.punchedAt,
      });
    } else if (isPjContractor(emp)) {
      worked.push({ ...base, pjNoClock: true });
    } else {
      absent.push(base);
    }
  }

  const byName = (a: RosterDayPerson, b: RosterDayPerson) =>
    a.name.localeCompare(b.name, 'pt-BR');
  worked.sort(byName);
  absent.sort(byName);
  off.sort(byName);

  return { worked, absent, off, published: true };
}
