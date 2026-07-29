/**
 * Pure PTRP time-calculation helpers (Portaria 671-oriented).
 * No I/O — easy to unit-test.
 */

import { Punch, Shift, ShiftDaySchedule, ShiftWeekday, TimesheetDayStatus } from '../types';
import { punchLocalDateKey } from './punch.service';

/** Expected work minutes at/above this = full journey → exactly 4 punches required. */
export const FULL_JOURNEY_MIN_EXPECTED_MINUTES = 360;

export function parseHmToMinutes(hm: string | undefined | null): number | null {
  if (!hm) return null;
  const m = String(hm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function minutesBetween(startIso: string, endIso: string): number {
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 60000);
}

export function timeOnDateToIso(date: string, hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m || 0, 0, 0);
  return d.toISOString();
}

/** Night minutes between two instants intersecting [nightStart, nightEnd) (may wrap midnight). */
export function calcNightMinutes(
  startIso: string,
  endIso: string,
  nightStartHm: string,
  nightEndHm: string
): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (end <= start) return 0;

  const ns = parseHmToMinutes(nightStartHm) ?? 22 * 60;
  const ne = parseHmToMinutes(nightEndHm) ?? 5 * 60;

  let total = 0;
  // Walk each calendar minute in 15-min steps for simplicity
  const step = 15 * 60000;
  for (let t = start; t < end; t += step) {
    const d = new Date(t);
    const mins = d.getHours() * 60 + d.getMinutes();
    const inNight = ns > ne ? mins >= ns || mins < ne : mins >= ns && mins < ne;
    if (inNight) total += 15;
  }
  return total;
}

const WEEKDAY_NAMES: ShiftWeekday[] = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export function getWeekdayName(date: string): ShiftWeekday {
  const day = new Date(`${date}T12:00:00`).getDay();
  return WEEKDAY_NAMES[day];
}

/** Effective schedule for a calendar date (base shift + optional day_schedules override). */
export function resolveShiftDay(shift: Shift | null, date: string): {
  startTime?: string;
  endTime?: string;
  breakDurationMinutes: number;
  breakFlexible: boolean;
  breakEarliestStart?: string;
  breakLatestEnd?: string;
  expectedDailyMinutes: number;
} {
  if (!shift) {
    return {
      breakDurationMinutes: 60,
      breakFlexible: true,
      expectedDailyMinutes: 480,
    };
  }
  const weekday = getWeekdayName(date);
  const override: ShiftDaySchedule | undefined = shift.daySchedules?.[weekday];
  const breakEarliestStart = override?.breakEarliestStart || shift.breakEarliestStart;
  const breakLatestEnd = override?.breakLatestEnd || shift.breakLatestEnd;
  let breakDurationMinutes =
    override?.breakDurationMinutes ?? shift.breakDurationMinutes ?? 60;
  const breakFlexible = shift.breakFlexible ?? true;
  if (!breakFlexible && breakEarliestStart && breakLatestEnd) {
    const startM = parseHmToMinutes(breakEarliestStart);
    const endM = parseHmToMinutes(breakLatestEnd);
    if (startM != null && endM != null && endM > startM) {
      // Prefer explicit override duration when set; otherwise sync from window.
      if (override?.breakDurationMinutes == null) {
        breakDurationMinutes = endM - startM;
      }
    }
  }
  return {
    startTime: override?.startTime || shift.startTime,
    endTime: override?.endTime || shift.endTime,
    breakDurationMinutes,
    breakFlexible,
    breakEarliestStart,
    breakLatestEnd,
    expectedDailyMinutes: override?.expectedDailyMinutes ?? shift.expectedDailyMinutes ?? 480,
  };
}

/** Pair chronological work punches (excluding break marks) into IN→OUT segments. */
export function computeWorkSegmentsFromPunches(
  punches: Punch[],
  date: string,
): {
  firstIn?: string;
  lastOut?: string;
  /** Sum of complete pair durations (lunch gaps already outside pairs). */
  pairedWorkMinutes: number;
  pairCount: number;
  punchCount: number;
  /** Gap between end of 1st pair and start of 2nd (measured lunch), if any. */
  gapBetweenPairsMinutes: number | null;
  incomplete: boolean;
} {
  const day = punches
    .filter(
      (p) =>
        !p.ignoredForCalc &&
        punchLocalDateKey(p.punchedAt) === date &&
        p.direction !== 'BREAK_START' &&
        p.direction !== 'BREAK_END',
    )
    .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));

  const punchCount = day.length;
  if (punchCount === 0) {
    return {
      pairedWorkMinutes: 0,
      pairCount: 0,
      punchCount: 0,
      gapBetweenPairsMinutes: null,
      incomplete: false,
    };
  }

  let pairedWorkMinutes = 0;
  let pairCount = 0;
  for (let i = 0; i + 1 < day.length; i += 2) {
    pairedWorkMinutes += minutesBetween(day[i]!.punchedAt, day[i + 1]!.punchedAt);
    pairCount++;
  }

  let gapBetweenPairsMinutes: number | null = null;
  if (day.length >= 4) {
    gapBetweenPairsMinutes = minutesBetween(day[1]!.punchedAt, day[2]!.punchedAt);
  }

  return {
    firstIn: day[0]!.punchedAt,
    lastOut: pairCount > 0 ? day[pairCount * 2 - 1]!.punchedAt : undefined,
    pairedWorkMinutes,
    pairCount,
    punchCount,
    gapBetweenPairsMinutes,
    incomplete: punchCount % 2 === 1,
  };
}

/**
 * Worked minutes for the day:
 * - 2+ pairs (ex.: manhã + tarde após batida de almoço): soma dos pares (intervalo já fora).
 * - 3 batidas (falta 1 do almoço): 1ª→última − intervalo (incompleto, sem subcontar a tarde).
 * - 1 par (só entrada/saída do dia): bruto − intervalo medido ou do turno.
 */
export function resolveWorkedAndBreakMinutes(
  punches: Punch[],
  date: string,
  scheduledBreakMins: number,
): {
  workedMinutes: number;
  breakMinutes: number;
  firstIn?: string;
  lastOut?: string;
  incomplete: boolean;
  punchCount: number;
  pairCount: number;
} {
  const segments = computeWorkSegmentsFromPunches(punches, date);
  const measuredBreak = measureBreakMinutesFromPunches(punches, date);

  if (segments.pairCount === 0) {
    return {
      workedMinutes: 0,
      breakMinutes: 0,
      firstIn: segments.firstIn,
      lastOut: segments.lastOut,
      incomplete: segments.incomplete || segments.punchCount > 0,
      punchCount: segments.punchCount,
      pairCount: 0,
    };
  }

  if (segments.pairCount >= 2) {
    const breakMinutes =
      measuredBreak ??
      segments.gapBetweenPairsMinutes ??
      scheduledBreakMins;
    return {
      workedMinutes: segments.pairedWorkMinutes,
      breakMinutes,
      firstIn: segments.firstIn,
      lastOut: segments.lastOut,
      incomplete: segments.incomplete,
      punchCount: segments.punchCount,
      pairCount: segments.pairCount,
    };
  }

  const breakMinutes = measuredBreak ?? scheduledBreakMins;

  // Exactly 3 work punches → missing one lunch mark. Pairing alone only credits
  // the morning segment; use first→last − break (same as classic span).
  if (segments.punchCount === 3 && segments.incomplete) {
    const day = punches
      .filter(
        (p) =>
          !p.ignoredForCalc &&
          punchLocalDateKey(p.punchedAt) === date &&
          p.direction !== 'BREAK_START' &&
          p.direction !== 'BREAK_END',
      )
      .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));
    const first = day[0]?.punchedAt;
    const last = day[2]?.punchedAt;
    if (first && last) {
      return {
        workedMinutes: Math.max(0, minutesBetween(first, last) - breakMinutes),
        breakMinutes,
        firstIn: first,
        lastOut: last,
        incomplete: true,
        punchCount: 3,
        pairCount: 1,
      };
    }
  }

  // Single in→out span for the whole day: deduct break once.
  return {
    workedMinutes: Math.max(0, segments.pairedWorkMinutes - breakMinutes),
    breakMinutes,
    firstIn: segments.firstIn,
    lastOut: segments.lastOut,
    incomplete: segments.incomplete,
    punchCount: segments.punchCount,
    pairCount: segments.pairCount,
  };
}

/** Measured break from BREAK_START/BREAK_END pair, or null if incomplete. */
export function measureBreakMinutesFromPunches(punches: Punch[], date: string): number | null {
  const dayPunches = punches
    .filter((p) => !p.ignoredForCalc && punchLocalDateKey(p.punchedAt) === date)
    .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));

  const starts = dayPunches.filter((p) => p.direction === 'BREAK_START');
  const ends = dayPunches.filter((p) => p.direction === 'BREAK_END');
  if (!starts.length || !ends.length) return null;

  const startAt = starts[0]!.punchedAt;
  const end = ends.find((e) => e.punchedAt > startAt) ?? ends[ends.length - 1];
  if (!end || end.punchedAt <= startAt) return null;
  return minutesBetween(startAt, end.punchedAt);
}

export function isWorkingDay(date: string, workingDays: string[]): boolean {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const abbr = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const day = new Date(`${date}T12:00:00`).getDay();
  const full = names[day];
  const short = abbr[day];
  return workingDays.some(w => {
    const u = w.toUpperCase();
    return u === full.toUpperCase() || u === short || u.startsWith(short.slice(0, 3));
  });
}

export interface DayCalcInput {
  date: string;
  punches: Punch[];
  shift: Shift | null;
  isHoliday: boolean;
  onApprovedLeave: boolean;
  leaveRequestId?: string;
  /** When a roster is published for this date: WORK forces duty, OFF forces day off. */
  rosterStatus?: 'WORK' | 'OFF' | null;
  /** ISO date (YYYY-MM-DD). Days before this are outside employment — no absence. */
  joiningDate?: string;
  /** ISO date (YYYY-MM-DD). Days after this are outside employment — no absence. */
  terminationDate?: string;
  /**
   * "Now" reference date (YYYY-MM-DD, org-local). Defaults to today.
   * Dates strictly after this are in the future: they can never be ABSENT nor
   * debit the hour bank — the workday simply hasn't happened yet.
   */
  asOfDate?: string;
  /**
   * ISO date (YYYY-MM-DD) when the timekeeping device started collecting
   * punches. Dates strictly before this have no punch data at all, so a
   * zero-punch day must not become a false ABSENT nor debit the hour bank.
   */
  clockStartDate?: string;
}

/** Local calendar date (YYYY-MM-DD) for "today", timezone of the runtime. */
export function localTodayIso(): string {
  return new Date().toLocaleDateString('en-CA');
}

export interface DayCalcResult {
  expectedMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  absenceMinutes: number;
  status: TimesheetDayStatus;
  firstPunchAt?: string;
  lastPunchAt?: string;
  leaveRequestId?: string;
  shiftId?: string;
}

/** Non-working day outside employment window — not an absence. */
const ZERO_OFF_DAY = (shiftId?: string): DayCalcResult => ({
  expectedMinutes: 0,
  workedMinutes: 0,
  breakMinutes: 0,
  lateMinutes: 0,
  earlyOutMinutes: 0,
  overtimeMinutes: 0,
  nightMinutes: 0,
  absenceMinutes: 0,
  status: 'OFF',
  shiftId,
});

/** True when the calendar day is outside the employment window. */
export function isOutsideEmploymentWindow(
  date: string,
  joiningDate?: string | null,
  terminationDate?: string | null,
): boolean {
  if (joiningDate && date < joiningDate) return true;
  if (terminationDate && date > terminationDate) return true;
  return false;
}

export function calculateDay(input: DayCalcInput): DayCalcResult {
  const {
    date,
    punches,
    shift,
    isHoliday,
    onApprovedLeave,
    leaveRequestId,
    rosterStatus,
    joiningDate,
    terminationDate,
  } = input;

  // Outside employment window: not expected to work, never ABSENT.
  if (isOutsideEmploymentWindow(date, joiningDate, terminationDate)) {
    return ZERO_OFF_DAY(shift?.id);
  }

  // Before the clock was integrated there is no punch data for anyone, so a
  // zero-punch day must not become a false ABSENT nor debit the hour bank.
  if (input.clockStartDate && date < input.clockStartDate) {
    return ZERO_OFF_DAY(shift?.id);
  }

  // Future date: the workday hasn't happened yet. Never ABSENT, never debits
  // the hour bank. When the date arrives it is recalculated normally.
  const asOf = input.asOfDate || localTodayIso();
  if (date > asOf) {
    return ZERO_OFF_DAY(shift?.id);
  }

  // Holiday: only people explicitly rostered to WORK are on duty
  if (isHoliday && rosterStatus !== 'WORK') {
    return {
      expectedMinutes: 0,
      workedMinutes: 0,
      breakMinutes: 0,
      lateMinutes: 0,
      earlyOutMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes: 0,
      absenceMinutes: 0,
      status: 'HOLIDAY',
      shiftId: shift?.id,
    };
  }

  if (onApprovedLeave) {
    return {
      expectedMinutes: 0,
      workedMinutes: 0,
      breakMinutes: 0,
      lateMinutes: 0,
      earlyOutMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes: 0,
      absenceMinutes: 0,
      status: 'LEAVE',
      leaveRequestId,
      shiftId: shift?.id,
    };
  }

  const shiftWorking = shift ? isWorkingDay(date, shift.workingDays || []) : true;
  let working = shiftWorking;
  if (rosterStatus === 'WORK') working = true;
  if (rosterStatus === 'OFF') working = false;

  const daySched = resolveShiftDay(shift, date);
  const expected = working ? daySched.expectedDailyMinutes : 0;
  const scheduledBreakMins = daySched.breakDurationMinutes;
  const grace = shift?.lateGracePeriod ?? 0;
  const earlyGrace = shift?.earlyOutGracePeriod ?? 0;

  const work = resolveWorkedAndBreakMinutes(punches, date, scheduledBreakMins);
  const first = work.firstIn;
  const last = work.lastOut;
  const breakMins = work.breakMinutes;
  const worked = work.workedMinutes;

  if (!working) {
    return {
      expectedMinutes: 0,
      workedMinutes: 0,
      breakMinutes: 0,
      lateMinutes: 0,
      earlyOutMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes: 0,
      absenceMinutes: 0,
      status: isHoliday ? 'HOLIDAY' : 'OFF',
      firstPunchAt: first,
      lastPunchAt: last,
      shiftId: shift?.id,
    };
  }

  if (!first) {
    return {
      expectedMinutes: expected,
      workedMinutes: 0,
      breakMinutes: 0,
      lateMinutes: 0,
      earlyOutMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes: 0,
      absenceMinutes: expected,
      status: 'ABSENT',
      shiftId: shift?.id,
    };
  }

  if (!last || last === first || (work.incomplete && work.pairCount === 0)) {
    return {
      expectedMinutes: expected,
      workedMinutes: 0,
      breakMinutes: 0,
      lateMinutes: 0,
      earlyOutMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes: 0,
      absenceMinutes: 0,
      status: 'INCOMPLETE',
      firstPunchAt: first,
      lastPunchAt: last,
      shiftId: shift?.id,
    };
  }

  let lateMinutes = 0;
  if (daySched.startTime) {
    const startIso = timeOnDateToIso(date, daySched.startTime);
    const lateRaw = minutesBetween(startIso, first);
    lateMinutes = Math.max(0, lateRaw - grace);
  }

  let earlyOutMinutes = 0;
  if (daySched.endTime && last) {
    const endIso = timeOnDateToIso(date, daySched.endTime);
    if (new Date(last) < new Date(endIso)) {
      earlyOutMinutes = Math.max(0, minutesBetween(last, endIso) - earlyGrace);
    }
  }

  const overtimeMinutes = Math.max(0, worked - expected);
  const nightMinutes = calcNightMinutes(
    first,
    last,
    shift?.nightStart || '22:00',
    shift?.nightEnd || '05:00'
  );

  let status: TimesheetDayStatus = 'OK';
  if (lateMinutes > 0) status = 'LATE';
  // Any odd work-punch count (ex.: falta saída 2) is incomplete — not approvable as OK/LATE.
  if (work.incomplete) status = 'INCOMPLETE';
  // Full journey (≥6h expected): must have exactly 4 marks (2 pairs). 2-punch days stay half-day only.
  if (
    expected >= FULL_JOURNEY_MIN_EXPECTED_MINUTES &&
    work.punchCount > 0 &&
    (work.punchCount !== 4 || work.pairCount !== 2)
  ) {
    status = 'INCOMPLETE';
  }

  const shortfall = Math.max(0, expected - worked);

  return {
    expectedMinutes: expected,
    workedMinutes: worked,
    breakMinutes: breakMins,
    lateMinutes,
    earlyOutMinutes,
    overtimeMinutes,
    nightMinutes,
    absenceMinutes: shortfall,
    status,
    firstPunchAt: first,
    lastPunchAt: last,
    shiftId: shift?.id,
  };
}
