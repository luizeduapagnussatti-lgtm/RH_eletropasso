import type { Employee, TimesheetDay, User } from '../types';
import { hrService } from '../services/hrService';
import { competenceForDate, normalizePeriodStartDay } from './payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../constants';
import { displayAbsenceMinutes } from './timesheetDisplay';
import {
  formatClockCredentialDisplay,
  normalizeClockCredential,
} from './employeeCredentials';

/** Prefer badge/crachá, then UUID — both may appear in timesheet_days / punches. */
export function resolveEmployeeKeys(
  user: User | Employee,
  profile?: Employee | null,
): string[] {
  const keys: string[] = [];
  const push = (v?: string | null) => {
    const s = (v || '').trim();
    if (s && !keys.includes(s)) keys.push(s);
  };
  const pushPis = (v?: string | null) => {
    const raw = (v || '').trim();
    if (!raw) return;
    push(raw);
    const digits = raw.replace(/\D/g, '');
    if (digits) {
      push(digits);
      if (digits.length <= 12) push(digits.padStart(12, '0'));
    }
  };
  pushPis(profile?.employeeId);
  pushPis((user as Employee).employeeId);
  push(profile?.clockCredential);
  push((user as Employee).clockCredential);
  const cred =
    normalizeClockCredential(profile?.clockCredential) ||
    normalizeClockCredential((user as Employee).clockCredential);
  if (cred) {
    push(cred);
    push(formatClockCredentialDisplay(cred));
  }
  push(profile?.id);
  push(user.id);
  return keys;
}

/**
 * Load timesheet days for an employee trying crachá then UUID.
 * Merges rows across keys (days may be split between badge and UUID).
 * Falls back to filtering the full period list when keyed queries miss.
 */
export async function loadTimesheetDaysForEmployee(
  periodId: string,
  keys: string[],
): Promise<TimesheetDay[]> {
  const byId = new Map<string, TimesheetDay>();
  for (const key of keys) {
    const rows = await hrService.listTimesheetDays(periodId, key);
    for (const row of rows) byId.set(row.id, row);
  }
  if (byId.size > 0) {
    return [...byId.values()].sort((a, b) => a.workDate.localeCompare(b.workDate));
  }
  if (keys.length === 0) return [];
  const all = await hrService.listTimesheetDays(periodId);
  const keySet = new Set(keys);
  return all.filter((d) => keySet.has(d.employeeId));
}

function shiftCompetence(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

async function resolvePeriodStartDay(): Promise<number> {
  try {
    const config = await hrService.getConfig();
    return normalizePeriodStartDay(
      config?.ptrpPolicy?.periodStartDay ?? DEFAULT_PTRP_POLICY.periodStartDay,
    );
  } catch {
    return normalizePeriodStartDay(DEFAULT_PTRP_POLICY.periodStartDay);
  }
}

export type EmployeeMonthTotals = {
  worked: number;
  overtime: number;
  absence: number;
  periodLabel: string;
  /** True when at least one timesheet_day row was found for the shown competence. */
  hasDays: boolean;
};

function sumDays(days: TimesheetDay[]): Omit<EmployeeMonthTotals, 'periodLabel' | 'hasDays'> {
  return {
    worked: days.reduce((s, d) => s + (d.workedMinutes || 0), 0),
    overtime: days.reduce((s, d) => s + (d.overtimeMinutes || 0), 0),
    absence: days.reduce((s, d) => s + displayAbsenceMinutes(d), 0),
  };
}

/**
 * Home "totais do mês": prefer current PTRP competence; if it has no hours yet
 * (common right after the 26th cutover), fall back to the previous competence
 * that still holds the accumulated totals.
 */
export async function loadEmployeeMonthTotals(
  keys: string[],
  ref: Date = new Date(),
): Promise<EmployeeMonthTotals | null> {
  if (!keys.length) return null;
  const startDay = await resolvePeriodStartDay();
  let competence = competenceForDate(ref, startDay);

  let bestEmpty: EmployeeMonthTotals | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const period = await hrService.getOrCreateTimesheetPeriod(
      competence.year,
      competence.month,
    );
    const days = await loadTimesheetDaysForEmployee(period.id, keys);
    const sums = sumDays(days);
    const periodLabel = `${String(competence.month).padStart(2, '0')}/${competence.year}`;
    const row: EmployeeMonthTotals = {
      ...sums,
      periodLabel,
      hasDays: days.length > 0,
    };

    const hasHours = sums.worked > 0 || sums.overtime > 0 || sums.absence > 0;
    if (hasHours) return row;
    if (!bestEmpty && days.length > 0) bestEmpty = row;

    competence = shiftCompetence(competence.year, competence.month, -1);
  }

  return bestEmpty;
}
