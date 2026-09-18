/**
 * Full-competence "Meta prevista" (26→25): shift/roster projection for days
 * not yet in timesheet_days, plus stored expectedMinutes for days already calculated.
 */

import type {
  Employee,
  Holiday,
  LeaveRequest,
  Shift,
  ShiftOverride,
  TimesheetDay,
  WorkRosterAssignment,
} from '../types';
import {
  getWeekdayName,
  isOutsideEmploymentWindow,
  isWorkingDay,
  resolveShiftDay,
} from '../services/timeCalculation.service';
import { eachDateInRange } from './payrollPeriod';

export type RosterStatusForDate = 'WORK' | 'OFF' | null;

/**
 * Planned expected minutes for one calendar date (includes future days).
 * Mirrors calculateDay working/holiday/leave/roster rules, but does NOT
 * zero-out future dates (those are part of the period target).
 */
export function projectExpectedMinutesForDate(input: {
  date: string;
  shift: Shift | null;
  rosterStatus: RosterStatusForDate;
  isHoliday: boolean;
  onApprovedLeave: boolean;
  joiningDate?: string | null;
  terminationDate?: string | null;
  clockStartDate?: string | null;
}): number {
  const { date, shift, rosterStatus, isHoliday, onApprovedLeave } = input;

  if (isOutsideEmploymentWindow(date, input.joiningDate, input.terminationDate)) {
    return 0;
  }
  if (input.clockStartDate && date < input.clockStartDate) {
    return 0;
  }
  if (isHoliday && rosterStatus !== 'WORK') {
    return 0;
  }
  if (onApprovedLeave) {
    return 0;
  }

  const shiftWorking = shift ? isWorkingDay(date, shift.workingDays || []) : true;
  let working = shiftWorking;
  if (getWeekdayName(date) === 'Saturday' && rosterStatus == null) {
    working = false;
  }
  if (rosterStatus === 'WORK') working = true;
  if (rosterStatus === 'OFF') working = false;
  if (!working) return 0;

  return resolveShiftDay(shift, date).expectedDailyMinutes || 0;
}

function resolveShiftOnDate(
  date: string,
  employeeId: string,
  employeeShiftId: string | undefined,
  shifts: Shift[],
  overrides: ShiftOverride[],
): Shift | null {
  if (shifts.length === 0) return null;
  const activeOverride = overrides.find(
    (o) => o.employeeId === employeeId && date >= o.startDate && date <= o.endDate,
  );
  if (activeOverride) {
    const overrideShift = shifts.find((s) => s.id === activeOverride.shiftId);
    if (overrideShift) return overrideShift;
  }
  if (employeeShiftId) {
    const assigned = shifts.find((s) => s.id === employeeShiftId);
    if (assigned) return assigned;
  }
  return (
    shifts.find((s) => s.isDefault && s.active !== false) ||
    shifts.find((s) => s.active !== false) ||
    null
  );
}

function rosterMapFromAssignments(
  rows: WorkRosterAssignment[],
  keys: string[],
): Map<string, 'WORK' | 'OFF'> {
  const keySet = new Set(keys.filter(Boolean));
  const map = new Map<string, 'WORK' | 'OFF'>();
  for (const row of rows) {
    if (!keySet.has(row.employeeId)) continue;
    map.set(row.workDate, row.status);
  }
  return map;
}

/**
 * Sum expected minutes for every date in [startDate, endDate]:
 * - existing timesheet day → stored expectedMinutes (already from shift calc)
 * - missing day (typically future) → project from shift + escala + feriado/férias
 */
export function sumPeriodExpectedMinutes(input: {
  startDate: string;
  endDate: string;
  days: TimesheetDay[];
  employee: Pick<Employee, 'id' | 'shiftId' | 'joiningDate' | 'terminationDate'>;
  employeeKeys: string[];
  shifts: Shift[];
  overrides: ShiftOverride[];
  rosterRows: WorkRosterAssignment[];
  holidays: Holiday[];
  leaves: LeaveRequest[];
  clockStartDate?: string | null;
}): number {
  const dayByDate = new Map(input.days.map((d) => [d.workDate, d]));
  const rosterByDate = rosterMapFromAssignments(input.rosterRows, input.employeeKeys);
  const holidayDates = new Set(input.holidays.map((h) => h.date));
  const empKeys = new Set(
    [input.employee.id, ...input.employeeKeys].filter(Boolean),
  );
  const leaveRanges = input.leaves
    .filter(
      (l) =>
        l.status === 'APPROVED' &&
        (empKeys.has(l.employeeId) || !l.employeeId),
    )
    .map((l) => ({ start: l.startDate, end: l.endDate }));

  let total = 0;
  for (const date of eachDateInRange(input.startDate, input.endDate)) {
    const existing = dayByDate.get(date);
    if (existing) {
      total += existing.expectedMinutes || 0;
      continue;
    }

    const shift = resolveShiftOnDate(
      date,
      input.employee.id,
      input.employee.shiftId,
      input.shifts,
      input.overrides,
    );
    const rosterStatus = rosterByDate.get(date) ?? null;
    const onApprovedLeave = leaveRanges.some(
      (r) => date >= r.start && date <= r.end,
    );

    total += projectExpectedMinutesForDate({
      date,
      shift,
      rosterStatus,
      isHoliday: holidayDates.has(date),
      onApprovedLeave,
      joiningDate: input.employee.joiningDate,
      terminationDate: input.employee.terminationDate,
      clockStartDate: input.clockStartDate,
    });
  }
  return total;
}
