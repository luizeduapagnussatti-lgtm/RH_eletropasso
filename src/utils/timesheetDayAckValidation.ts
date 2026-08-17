import type { Punch, TimesheetDay } from '../types';
import { todayIsoLocal } from './payrollPeriod';
import {
  computeWorkSegmentsFromPunches,
  FULL_JOURNEY_MIN_EXPECTED_MINUTES,
} from '../services/timeCalculation.service';
import {
  checkDayCoherence,
  type DayCoherenceContext,
} from './timesheetDayCoherence';

export type DayAckBlockReason =
  | 'absent'
  | 'incomplete'
  | 'adjustedNoRemarks'
  | 'missingPunches'
  | 'needFourPunches'
  | 'incoherentTotals'
  | 'unknown';

export interface DayAckValidation {
  ok: boolean;
  reason?: DayAckBlockReason;
}

export interface DayAckBlock {
  dayId: string;
  workDate: string;
  status: string;
  reason: DayAckBlockReason;
}

/** Non-working / excused days — approve without punch pairs. */
const NO_PUNCH_REQUIRED = new Set(['OFF', 'HOLIDAY', 'LEAVE']);

export { FULL_JOURNEY_MIN_EXPECTED_MINUTES };

export function isFullJourneyExpected(expectedMinutes: number): boolean {
  return (expectedMinutes || 0) >= FULL_JOURNEY_MIN_EXPECTED_MINUTES;
}

/** Legacy rows: rest days were stored as OK with expectedMinutes=0 before OFF existed. */
function isLegacyRestDay(day: Pick<TimesheetDay, 'status' | 'expectedMinutes'>): boolean {
  return day.status === 'OK' && (day.expectedMinutes || 0) === 0;
}

function punchKey(employeeId: string, workDate: string): string {
  return `${employeeId}|${workDate}`;
}

export type PunchPairBlockReason = 'missingPunches' | 'incomplete' | 'needFourPunches';

/**
 * Punch rules for manager approval:
 * - Full journey (expected ≥ 360): exactly 4 work punches (2 complete IN→OUT pairs).
 * - Half / reduced day: at least one complete pair (even count).
 * Ignores BREAK_* and ignored_for_calc punches.
 */
export function dayHasCompletePunchPairs(
  workDate: string,
  punches: Punch[] | undefined | null,
  expectedMinutes = 0
): { ok: boolean; reason?: PunchPairBlockReason } {
  const list = punches || [];
  const segs = computeWorkSegmentsFromPunches(list, workDate);
  if (segs.punchCount === 0) return { ok: false, reason: 'missingPunches' };
  if (segs.incomplete || segs.pairCount < 1) return { ok: false, reason: 'incomplete' };

  if (isFullJourneyExpected(expectedMinutes)) {
    if (segs.punchCount !== 4 || segs.pairCount !== 2) {
      return { ok: false, reason: 'needFourPunches' };
    }
  }

  return { ok: true };
}

/**
 * Whether a manager may set manager_ack=true on this day.
 * Full journey days need exactly 4 punches; half-days need complete pairs.
 * Pass `punches` for the day whenever available — first/last alone is not enough
 * (2 or 3 batidas still set first+last but lack the full set).
 */
export function isDayApprovable(
  day: Pick<
    TimesheetDay,
    | 'status'
    | 'expectedMinutes'
    | 'workedMinutes'
    | 'firstPunchAt'
    | 'lastPunchAt'
    | 'remarks'
    | 'workDate'
    | 'employeeId'
    | 'breakMinutes'
    | 'lateMinutes'
    | 'earlyOutMinutes'
    | 'overtimeMinutes'
    | 'nightMinutes'
    | 'absenceMinutes'
  >,
  punches?: Punch[] | null,
  coherenceCtx?: DayCoherenceContext | null,
): DayAckValidation {
  const status = day.status;
  const expected = day.expectedMinutes || 0;
  const worked = day.workedMinutes || 0;

  if (NO_PUNCH_REQUIRED.has(status) || isLegacyRestDay(day)) {
    return { ok: true };
  }

  if (status === 'ABSENT') {
    if (day.remarks && day.remarks.trim()) {
      return { ok: true };
    }
    return { ok: false, reason: 'absent' };
  }

  if (status === 'INCOMPLETE') {
    return { ok: false, reason: 'incomplete' };
  }

  const needsPairs =
    status === 'OK' ||
    status === 'LATE' ||
    (status === 'ADJUSTED' && !(expected === 0 && worked === 0));

  if (status === 'ADJUSTED') {
    if (!(day.remarks && day.remarks.trim())) {
      return { ok: false, reason: 'adjustedNoRemarks' };
    }
    if (expected === 0 && worked === 0) {
      return { ok: true };
    }
  }

  if (needsPairs) {
    if (punches) {
      const pairs = dayHasCompletePunchPairs(day.workDate, punches, expected);
      if (!pairs.ok) return { ok: false, reason: pairs.reason || 'incomplete' };
      if (coherenceCtx) {
        const { coherent } = checkDayCoherence(day, punches, coherenceCtx);
        if (!coherent) return { ok: false, reason: 'incoherentTotals' };
      }
      return { ok: true };
    }
    // Without punch list we cannot prove 4 marks on a full journey.
    if (isFullJourneyExpected(expected)) {
      return { ok: false, reason: 'needFourPunches' };
    }
    const first = day.firstPunchAt?.trim();
    const last = day.lastPunchAt?.trim();
    if (!first || !last || first === last) {
      return { ok: false, reason: 'missingPunches' };
    }
    return { ok: true };
  }

  return { ok: false, reason: 'unknown' };
}

export function partitionApprovableDays(
  days: TimesheetDay[],
  punchesByEmpDate?: Map<string, Punch[]>,
  coherenceCtxByEmpDate?: Map<string, DayCoherenceContext>,
): { approvable: TimesheetDay[]; blocked: DayAckBlock[] } {
  const approvable: TimesheetDay[] = [];
  const blocked: DayAckBlock[] = [];
  for (const day of days) {
    const key = punchKey(day.employeeId, day.workDate);
    const punches = punchesByEmpDate?.get(key);
    const coherenceCtx = coherenceCtxByEmpDate?.get(key);
    const v = isDayApprovable(day, punches, coherenceCtx);
    if (v.ok) {
      approvable.push(day);
    } else {
      blocked.push({
        dayId: day.id,
        workDate: day.workDate,
        status: day.status,
        reason: v.reason || 'unknown',
      });
    }
  }
  return { approvable, blocked };
}

export function buildPunchMapKey(employeeId: string, workDate: string): string {
  return punchKey(employeeId, workDate);
}

export class TimesheetAckValidationError extends Error {
  readonly blocked: DayAckBlock[];

  constructor(blocked: DayAckBlock[]) {
    super('ack_validation_failed');
    this.name = 'TimesheetAckValidationError';
    this.blocked = blocked;
  }
}

/** Elapsed days in export scope must all have manager_ack. */
export function canExportMirrorPdf(
  days: TimesheetDay[],
  today = todayIsoLocal()
): { ok: boolean; pendingCount: number; scopeCount: number } {
  const scope = days.filter(d => d.workDate <= today);
  const pendingCount = scope.filter(d => !d.managerAck).length;
  return {
    ok: scope.length > 0 && pendingCount === 0,
    pendingCount,
    scopeCount: scope.length,
  };
}

/** i18n key for a block reason (ptrp namespace). */
export function dayAckBlockI18nKey(reason: DayAckBlockReason): string {
  switch (reason) {
    case 'absent':
      return 'ackBlockedAbsent';
    case 'incomplete':
      return 'ackBlockedIncomplete';
    case 'adjustedNoRemarks':
      return 'ackBlockedAdjustedNoRemarks';
    case 'missingPunches':
      return 'ackBlockedMissingPunches';
    case 'needFourPunches':
      return 'ackBlockedNeedFourPunches';
    case 'incoherentTotals':
      return 'ackBlockedIncoherentTotals';
    default:
      return 'ackBlockedUnknown';
  }
}
