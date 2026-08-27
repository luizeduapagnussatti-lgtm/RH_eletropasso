import type { Employee, TimesheetDayStatus } from '../types';
import { isTimesheetExempt } from './roles';

export type CompetenceWindow = {
  startDate: string;
  endDate: string;
};

/** Employment overlaps this competence (hire not after end; last day not before start). */
export function overlapsCompetence(
  emp: { joiningDate?: string | null; terminationDate?: string | null },
  period: CompetenceWindow,
): boolean {
  if (emp.joiningDate && emp.joiningDate > period.endDate) return false;
  if (emp.terminationDate && emp.terminationDate < period.startDate) return false;
  return true;
}

/** Still on payroll/clock for the live queue (not INACTIVE, not PJ/Admin/Diretoria). */
export function isActiveClockStaff(emp: {
  status?: string | null;
  role?: string | null;
  employmentType?: string | null;
}): boolean {
  if (emp.status === 'INACTIVE') return false;
  return !isTimesheetExempt(emp);
}

export function isActiveClockStaffInCompetence(
  emp: Employee,
  period: CompetenceWindow,
): boolean {
  return isActiveClockStaff(emp) && overlapsCompetence(emp, period);
}

/** Dismissed people who still overlap this competence (historical mirror). */
export function isDismissedInCompetence(
  emp: Employee,
  period: CompetenceWindow,
): boolean {
  if (emp.status !== 'INACTIVE') return false;
  if (isTimesheetExempt(emp)) return false;
  return overlapsCompetence(emp, period);
}

/** Clock-facing staff for a competence: ativos + demitidos que ainda sobrepõem o período. */
export function clockStaffInCompetence(emps: Employee[], period: CompetenceWindow): Employee[] {
  return emps.filter(e => !isTimesheetExempt(e) && overlapsCompetence(e, period));
}

const NON_DUTY: ReadonlySet<string> = new Set(['OFF', 'HOLIDAY', 'LEAVE']);

export function isDutyDayNeedingAck(status?: TimesheetDayStatus | string | null): boolean {
  if (!status) return true;
  return !NON_DUTY.has(status);
}

/** Jornada days up to lastWorkDate without manager ack (blocks discharge). */
export function pendingDutyAckDays<T extends {
  workDate: string;
  status?: string | null;
  managerAck?: boolean;
}>(
  days: T[],
  opts: { fromDate?: string | null; untilDate: string },
): T[] {
  return days.filter(d => {
    if (opts.fromDate && d.workDate < opts.fromDate) return false;
    if (d.workDate > opts.untilDate) return false;
    if (!isDutyDayNeedingAck(d.status)) return false;
    return !d.managerAck;
  });
}
