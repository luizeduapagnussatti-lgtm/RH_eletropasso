/**
 * Classify daily overtime into HE 60% vs HE 100% (Eletropasso rule).
 * Weekday/Saturday: first 120 minutes at 60% (stored as extra50Minutes), remainder at 100%.
 * Sunday or org holiday: 100% from the first minute.
 *
 * extra50Minutes is the lower overtime band (60% pay) — DB column extra_hours_50 is unchanged.
 */

export const WEEKDAY_OT_60_CAP_MINUTES = 120;

export function isSundayDate(workDate: string): boolean {
  return new Date(`${workDate}T12:00:00`).getDay() === 0;
}

export interface ClassifyOvertimeInput {
  workDate: string;
  overtimeMinutes: number;
  isHoliday: boolean;
  /** When roster forces WORK on a holiday, still 100% on that holiday date. */
  isSunday?: boolean;
}

export interface ClassifyOvertimeResult {
  extra50Minutes: number;
  extra100Minutes: number;
}

export function classifyOvertimeMinutes(input: ClassifyOvertimeInput): ClassifyOvertimeResult {
  const ot = Math.max(0, input.overtimeMinutes || 0);
  if (ot === 0) return { extra50Minutes: 0, extra100Minutes: 0 };

  const sunday = input.isSunday ?? isSundayDate(input.workDate);
  if (sunday || input.isHoliday) {
    return { extra50Minutes: 0, extra100Minutes: ot };
  }

  const extra50Minutes = Math.min(ot, WEEKDAY_OT_60_CAP_MINUTES);
  const extra100Minutes = Math.max(0, ot - WEEKDAY_OT_60_CAP_MINUTES);
  return { extra50Minutes, extra100Minutes };
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
