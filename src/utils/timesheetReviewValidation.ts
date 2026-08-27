import { Punch, TimesheetDay } from '../types';
import { todayIsoLocal } from './payrollPeriod';
import { buildPunchMapKey, isDayApprovable } from './timesheetDayAckValidation';

export type TimesheetReviewIssueKey =
  | 'reviewBlockIncomplete'
  | 'reviewBlockAdjustedNoRemarks'
  | 'reviewBlockNotApprovable'
  | 'reviewBlockMissingManagerAck'
  | 'reviewWarnMissingEmployeeAck'
  | 'reviewWarnMissingManagerAck';

export interface TimesheetReviewValidation {
  canSubmit: boolean;
  canApprove: boolean;
  blockingErrors: TimesheetReviewIssueKey[];
  warnings: TimesheetReviewIssueKey[];
  incompleteCount: number;
  adjustedNoRemarksCount: number;
  notApprovableCount: number;
  missingEmployeeAckCount: number;
  missingManagerAckCount: number;
}

/** Elapsed work days in scope (work_date <= today). */
export function elapsedTimesheetDays(days: TimesheetDay[], today = todayIsoLocal()): TimesheetDay[] {
  return days.filter(d => d.workDate <= today);
}

function punchesForDay(
  day: TimesheetDay,
  punches?: Punch[] | Map<string, Punch[]>
): Punch[] | undefined {
  if (!punches) return undefined;
  if (punches instanceof Map) {
    return punches.get(buildPunchMapKey(day.employeeId, day.workDate));
  }
  return punches.filter(
    p =>
      !p.ignoredForCalc &&
      (p.employeeId === day.employeeId || !day.employeeId) &&
      String(p.punchedAt || '').slice(0, 10) === day.workDate
  );
}

export function validateTimesheetEmployeeReview(
  days: TimesheetDay[],
  today = todayIsoLocal(),
  punches?: Punch[] | Map<string, Punch[]>
): TimesheetReviewValidation {
  const scope = elapsedTimesheetDays(days, today);
  const incompleteCount = scope.filter(d => d.status === 'INCOMPLETE').length;
  const adjustedNoRemarksCount = scope.filter(
    d => d.status === 'ADJUSTED' && !(d.remarks && d.remarks.trim())
  ).length;
  const notApprovableCount = scope.filter(d => !isDayApprovable(d, punchesForDay(d, punches)).ok).length;
  const missingEmployeeAckCount = scope.filter(d => !d.employeeAck).length;
  const missingManagerAckCount = scope.filter(d => !d.managerAck).length;

  const blockingErrors: TimesheetReviewIssueKey[] = [];
  const warnings: TimesheetReviewIssueKey[] = [];

  if (incompleteCount > 0) blockingErrors.push('reviewBlockIncomplete');
  if (adjustedNoRemarksCount > 0) blockingErrors.push('reviewBlockAdjustedNoRemarks');
  if (notApprovableCount > 0) blockingErrors.push('reviewBlockNotApprovable');
  // PDF / period close require every elapsed day approved by manager.
  if (missingManagerAckCount > 0) blockingErrors.push('reviewBlockMissingManagerAck');
  // Eletropasso: ciência do colaborador é na folha de pagamento, não no espelho PTRP.

  const canSubmit = blockingErrors.length === 0 && scope.length > 0;
  const canApprove = blockingErrors.length === 0 && scope.length > 0;

  return {
    canSubmit,
    canApprove,
    blockingErrors,
    warnings,
    incompleteCount,
    adjustedNoRemarksCount,
    notApprovableCount,
    missingEmployeeAckCount,
    missingManagerAckCount,
  };
}
