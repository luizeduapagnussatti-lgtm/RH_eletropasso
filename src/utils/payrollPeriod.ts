/**
 * Payroll / timesheet competence periods.
 *
 * Eletropasso default: closes on day 25 → period is 26 (prev month) to 25 (competence month).
 * Controlled by org ptrpPolicy.periodStartDay (1 = calendar month).
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function normalizePeriodStartDay(day?: number | null): number {
  if (day == null || Number.isNaN(day)) return 26;
  return Math.min(28, Math.max(1, Math.floor(day)));
}

/**
 * Bounds for a competence labeled by year + month (1–12).
 * month = closing month (contains the last day of the cycle).
 *
 * periodStartDay 1  → 01..last of month
 * periodStartDay 26 → prev-month-26 .. month-25
 */
export function periodBoundsForCompetence(
  year: number,
  month: number,
  periodStartDay: number = 26
): { startDate: string; endDate: string } {
  const startDay = normalizePeriodStartDay(periodStartDay);

  if (startDay === 1) {
    const startDate = `${year}-${pad2(month)}-01`;
    const last = new Date(year, month, 0).getDate();
    const endDate = `${year}-${pad2(month)}-${pad2(last)}`;
    return { startDate, endDate };
  }

  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  const endDay = startDay - 1;
  return {
    startDate: `${prevYear}-${pad2(prevMonth)}-${pad2(startDay)}`,
    endDate: `${year}-${pad2(month)}-${pad2(endDay)}`,
  };
}

/**
 * Which competence (year/month) a calendar date belongs to.
 * Example with startDay 26: 2026-07-22 → Jul/2026; 2026-07-26 → Aug/2026.
 */
export function competenceForDate(
  ref: Date,
  periodStartDay: number = 26
): { year: number; month: number } {
  const startDay = normalizePeriodStartDay(periodStartDay);
  const y = ref.getFullYear();
  const m = ref.getMonth() + 1; // 1–12
  const d = ref.getDate();

  if (startDay === 1) {
    return { year: y, month: m };
  }

  if (d >= startDay) {
    let next = m + 1;
    let ny = y;
    if (next > 12) {
      next = 1;
      ny = y + 1;
    }
    return { year: ny, month: next };
  }

  return { year: y, month: m };
}

/** Inclusive ISO date list YYYY-MM-DD */
export function eachDateInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Local calendar date as YYYY-MM-DD (not UTC). */
export function todayIsoLocal(ref: Date = new Date()): string {
  return `${ref.getFullYear()}-${pad2(ref.getMonth() + 1)}-${pad2(ref.getDate())}`;
}

/** Cap an end date so it never goes past today (local). */
export function minIsoDate(a: string, b: string): string {
  return a <= b ? a : b;
}
