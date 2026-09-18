import type { Employee, Punch, Team, TimesheetDay } from '../types';
import { isClockReportEmployee } from './roles';
import { punchLocalDateKey } from '../services/punch.service';
import { isDutyDayNeedingAck } from './timesheetScope';

export type ManagerTodayPerson = {
  id: string;
  name: string;
  department?: string;
  employeeId?: string;
  firstAt?: string;
  lastAt?: string;
  punchCount: number;
};

export type ManagerTodayAttendance = {
  present: ManagerTodayPerson[];
  missing: ManagerTodayPerson[];
  offDuty: ManagerTodayPerson[];
  teamCount: number;
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

/**
 * Team visible to a manager: members of teams they lead OR direct reports.
 * Excludes the manager themselves and non-clock staff.
 */
export function visibleTeamForManager(
  manager: { id: string },
  employees: Employee[],
  teams: Team[],
): Employee[] {
  const ledTeamIds = new Set(teams.filter(t => t.leaderId === manager.id).map(t => t.id));
  return employees.filter(e => {
    if (e.id === manager.id) return false;
    if (!isClockReportEmployee(e)) return false;
    if (e.lineManagerId === manager.id) return true;
    if (e.teamId && ledTeamIds.has(e.teamId)) return true;
    return false;
  });
}

function personKeys(emp: Employee): string[] {
  const keys: string[] = [];
  const push = (v?: string | null) => {
    const s = (v || '').trim();
    if (s && !keys.includes(s)) keys.push(s);
  };
  push(emp.id);
  push(emp.employeeId);
  push(emp.clockCredential);
  return keys;
}

/**
 * Build present / missing / off-duty lists for the manager home.
 * Punches with ignoredForCalc are excluded. OFF/HOLIDAY/LEAVE days (from
 * timesheet_days for today) go to offDuty, not missing.
 */
export function buildManagerTodayAttendance(opts: {
  team: Employee[];
  punches: Punch[];
  today: string;
  todayDays?: TimesheetDay[];
}): ManagerTodayAttendance {
  const { team, punches, today, todayDays = [] } = opts;

  const dayByEmployeeKey = new Map<string, TimesheetDay>();
  for (const d of todayDays) {
    if (d.workDate !== today) continue;
    dayByEmployeeKey.set(d.employeeId, d);
  }

  const punchesByPerson = new Map<string, Punch[]>();
  const keyToPersonId = new Map<string, string>();
  for (const emp of team) {
    for (const k of personKeys(emp)) keyToPersonId.set(k, emp.id);
  }

  for (const p of punches) {
    if (p.ignoredForCalc) continue;
    if (punchLocalDateKey(p.punchedAt) !== today) continue;
    const personId = keyToPersonId.get(p.employeeId);
    if (!personId) continue;
    const list = punchesByPerson.get(personId) || [];
    list.push(p);
    punchesByPerson.set(personId, list);
  }

  const present: ManagerTodayPerson[] = [];
  const missing: ManagerTodayPerson[] = [];
  const offDuty: ManagerTodayPerson[] = [];

  for (const emp of team) {
    const day =
      dayByEmployeeKey.get(emp.id) ||
      (emp.employeeId ? dayByEmployeeKey.get(emp.employeeId) : undefined) ||
      (emp.clockCredential ? dayByEmployeeKey.get(emp.clockCredential) : undefined);

    const isOff = day ? !isDutyDayNeedingAck(day.status) : false;
    const personPunches = (punchesByPerson.get(emp.id) || []).slice().sort(
      (a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime(),
    );

    const base: ManagerTodayPerson = {
      id: emp.id,
      name: emp.name,
      department: emp.department || undefined,
      employeeId: emp.employeeId || undefined,
      punchCount: personPunches.length,
    };

    if (personPunches.length > 0) {
      present.push({
        ...base,
        firstAt: personPunches[0]!.punchedAt,
        lastAt: personPunches[personPunches.length - 1]!.punchedAt,
      });
    } else if (isOff) {
      offDuty.push(base);
    } else {
      missing.push(base);
    }
  }

  present.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  missing.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  offDuty.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return {
    present,
    missing,
    offDuty,
    teamCount: team.length,
  };
}
