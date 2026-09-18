import type { Punch, TimesheetDay } from '../types';
import { punchLocalDateKey } from '../services/punch.service';
import { computeWorkSegmentsFromPunches } from '../services/timeCalculation.service';

const INSTANT_SLACK_MS = 2000;

function sameInstant(a?: string | null, b?: string | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return a === b;
  return Math.abs(ta - tb) <= INSTANT_SLACK_MS;
}

/**
 * True when stored timesheet_days no longer match live punches.
 * Catches the PWA-then-CLOCK race: grid lists 4 punches but hours were last
 * saved from APP-only (worked=0 / falta=08:00, first_punch = lunch).
 */
export function timesheetDayNeedsRecalc(
  row: Pick<TimesheetDay, 'firstPunchAt' | 'lastPunchAt' | 'workedMinutes'> | undefined | null,
  punches: Punch[],
  date: string,
): boolean {
  const segs = computeWorkSegmentsFromPunches(punches, date);
  if (segs.punchCount === 0) return false;
  if (!row || !row.firstPunchAt) return true;
  if (!sameInstant(row.firstPunchAt, segs.firstIn)) return true;
  if (segs.lastOut && !sameInstant(row.lastPunchAt, segs.lastOut)) return true;
  if (segs.punchCount >= 4 && (row.workedMinutes || 0) === 0) return true;
  return false;
}

/** Work dates in `punches` whose stored day is missing or out of date. */
export function staleTimesheetWorkDates(
  days: Pick<TimesheetDay, 'workDate' | 'firstPunchAt' | 'lastPunchAt' | 'workedMinutes'>[],
  punches: Punch[],
): string[] {
  const dayByDate = new Map(days.map((d) => [d.workDate, d]));
  const punchesByDate = new Map<string, Punch[]>();
  for (const p of punches) {
    const d = punchLocalDateKey(p.punchedAt);
    const list = punchesByDate.get(d);
    if (list) list.push(p);
    else punchesByDate.set(d, [p]);
  }
  return [...punchesByDate.keys()]
    .sort()
    .filter((d) => timesheetDayNeedsRecalc(dayByDate.get(d), punchesByDate.get(d) || [], d));
}
