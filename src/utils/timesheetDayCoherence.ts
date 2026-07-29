import type { Holiday, LeaveRequest, Punch, Shift, TimesheetDay } from '../types';
import {
  calculateDay,
  type DayCalcInput,
  type DayCalcResult,
} from '../services/timeCalculation.service';

export interface DayCoherenceContext {
  shift: Shift | null;
  isHoliday: boolean;
  onApprovedLeave: boolean;
  leaveRequestId?: string;
  rosterStatus?: 'WORK' | 'OFF' | null;
  joiningDate?: string;
  terminationDate?: string;
}

export interface DayCoherenceDiff {
  field: keyof Pick<
    DayCalcResult,
    | 'expectedMinutes'
    | 'workedMinutes'
    | 'breakMinutes'
    | 'lateMinutes'
    | 'earlyOutMinutes'
    | 'overtimeMinutes'
    | 'nightMinutes'
    | 'absenceMinutes'
    | 'status'
  >;
  stored: number | string;
  computed: number | string;
}

export interface DayCoherenceResult {
  coherent: boolean;
  computed: DayCalcResult;
  diffs: DayCoherenceDiff[];
}

const NUMERIC_FIELDS: Array<
  Exclude<DayCoherenceDiff['field'], 'status'>
> = [
  'expectedMinutes',
  'workedMinutes',
  'breakMinutes',
  'lateMinutes',
  'earlyOutMinutes',
  'overtimeMinutes',
  'nightMinutes',
  'absenceMinutes',
];

export function buildDayCalcInput(
  day: Pick<TimesheetDay, 'workDate' | 'employeeId'>,
  punches: Punch[],
  ctx: DayCoherenceContext,
): DayCalcInput {
  return {
    date: day.workDate,
    punches,
    shift: ctx.shift,
    isHoliday: ctx.isHoliday,
    onApprovedLeave: ctx.onApprovedLeave,
    leaveRequestId: ctx.leaveRequestId,
    rosterStatus: ctx.rosterStatus ?? null,
    joiningDate: ctx.joiningDate,
    terminationDate: ctx.terminationDate,
  };
}

export function buildDayCoherenceContext(
  day: Pick<TimesheetDay, 'workDate' | 'employeeId' | 'shiftId'>,
  opts: {
    shift: Shift | null;
    holidays: Holiday[];
    leaves: LeaveRequest[];
    employee?: { id?: string; employeeId?: string; shiftId?: string; joiningDate?: string; terminationDate?: string };
    rosterStatus?: 'WORK' | 'OFF' | null;
  },
): DayCoherenceContext {
  const punchKey = opts.employee?.employeeId || day.employeeId;
  const isHoliday = opts.holidays.some(h => h.date === day.workDate);
  const approvedLeave = opts.leaves.find(
    l =>
      l.status === 'APPROVED' &&
      (l.employeeId === opts.employee?.id ||
        l.employeeId === punchKey ||
        l.employeeId === day.employeeId) &&
      day.workDate >= l.startDate &&
      day.workDate <= l.endDate,
  );

  return {
    shift: opts.shift,
    isHoliday,
    onApprovedLeave: !!approvedLeave,
    leaveRequestId: approvedLeave?.id,
    rosterStatus: opts.rosterStatus ?? null,
    joiningDate: opts.employee?.joiningDate,
    terminationDate: opts.employee?.terminationDate,
  };
}

/** True when manual_adjustment is audit-only (no legacy numeric overrides). */
export function isAuditOnlyManualAdjustment(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const adj = value as Record<string, unknown>;
  const legacyNumeric =
    typeof adj.workedMinutes === 'number' ||
    typeof adj.overtimeMinutes === 'number' ||
    typeof adj.lateMinutes === 'number' ||
    typeof adj.absenceMinutes === 'number';
  return !legacyNumeric;
}

export function checkDayCoherence(
  day: Pick<
    TimesheetDay,
    | 'workDate'
    | 'expectedMinutes'
    | 'workedMinutes'
    | 'breakMinutes'
    | 'lateMinutes'
    | 'earlyOutMinutes'
    | 'overtimeMinutes'
    | 'nightMinutes'
    | 'absenceMinutes'
    | 'status'
  >,
  punches: Punch[],
  ctx: DayCoherenceContext,
): DayCoherenceResult {
  const computed = calculateDay(buildDayCalcInput(day, punches, ctx));
  const diffs: DayCoherenceDiff[] = [];

  for (const field of NUMERIC_FIELDS) {
    const stored = Number(day[field] ?? 0);
    const expected = Number(computed[field] ?? 0);
    if (stored !== expected) {
      diffs.push({ field, stored, computed: expected });
    }
  }

  if (day.status !== computed.status) {
    diffs.push({ field: 'status', stored: day.status, computed: computed.status });
  }

  return {
    coherent: diffs.length === 0,
    computed,
    diffs,
  };
}
