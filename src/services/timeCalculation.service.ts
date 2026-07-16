/**
 * Pure PTRP time-calculation helpers (Portaria 671-oriented).
 * No I/O — easy to unit-test.
 */

import { Punch, Shift, ShiftDaySchedule, ShiftWeekday, TimesheetDayStatus } from '../types';
import { consolidatePunchesForDay } from './punch.service';

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
  expectedDailyMinutes: number;
} {
  if (!shift) {
    return { breakDurationMinutes: 60, expectedDailyMinutes: 480 };
  }
  const weekday = getWeekdayName(date);
  const override: ShiftDaySchedule | undefined = shift.daySchedules?.[weekday];
  return {
    startTime: override?.startTime || shift.startTime,
    endTime: override?.endTime || shift.endTime,
    breakDurationMinutes: override?.breakDurationMinutes ?? shift.breakDurationMinutes ?? 60,
    expectedDailyMinutes: override?.expectedDailyMinutes ?? shift.expectedDailyMinutes ?? 480,
  };
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

export function calculateDay(input: DayCalcInput): DayCalcResult {
  const { date, punches, shift, isHoliday, onApprovedLeave, leaveRequestId } = input;

  if (isHoliday) {
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

  const working = shift ? isWorkingDay(date, shift.workingDays || []) : true;
  const daySched = resolveShiftDay(shift, date);
  const expected = working ? daySched.expectedDailyMinutes : 0;
  const breakMins = daySched.breakDurationMinutes;
  const grace = shift?.lateGracePeriod ?? 0;
  const earlyGrace = shift?.earlyOutGracePeriod ?? 0;

  const summary = consolidatePunchesForDay(punches, date);
  const first = summary.firstIn;
  const last = summary.lastOut;

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
      status: 'OK',
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

  if (!last || last === first) {
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

  const gross = minutesBetween(first, last);
  const worked = Math.max(0, gross - breakMins);

  let lateMinutes = 0;
  if (daySched.startTime) {
    const startIso = timeOnDateToIso(date, daySched.startTime);
    const lateRaw = minutesBetween(startIso, first);
    lateMinutes = Math.max(0, lateRaw - grace);
  }

  let earlyOutMinutes = 0;
  if (daySched.endTime) {
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
