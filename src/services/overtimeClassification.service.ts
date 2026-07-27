/**
 * Classify daily overtime into HE 50% vs HE 100% (Eletropasso rule).
 * 100%: Sunday or org holiday; 50%: all other days.
 */

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
  return { extra50Minutes: ot, extra100Minutes: 0 };
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
