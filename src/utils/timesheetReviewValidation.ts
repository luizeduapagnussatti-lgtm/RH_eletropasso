import { TimesheetDay } from '../types';
import { todayIsoLocal } from './payrollPeriod';

export type TimesheetReviewIssueKey =
  | 'reviewBlockIncomplete'
  | 'reviewBlockAdjustedNoRemarks'
  | 'reviewWarnMissingEmployeeAck'
  | 'reviewWarnMissingManagerAck';

export interface TimesheetReviewValidation {
  canSubmit: boolean;
  canApprove: boolean;
  blockingErrors: TimesheetReviewIssueKey[];
  warnings: TimesheetReviewIssueKey[];
  incompleteCount: number;
  adjustedNoRemarksCount: number;
  missingEmployeeAckCount: number;
  missingManagerAckCount: number;
}

/** Elapsed work days in scope (work_date <= today). */
export function elapsedTimesheetDays(days: TimesheetDay[], today = todayIsoLocal()): TimesheetDay[] {
  return days.filter(d => d.workDate <= today);
}

export function validateTimesheetEmployeeReview(days: TimesheetDay[], today = todayIsoLocal()): TimesheetReviewValidation {
  const scope = elapsedTimesheetDays(days, today);
  const incompleteCount = scope.filter(d => d.status === 'INCOMPLETE').length;
  const adjustedNoRemarksCount = scope.filter(
    d => d.status === 'ADJUSTED' && !(d.remarks && d.remarks.trim())
  ).length;
  const missingEmployeeAckCount = scope.filter(d => !d.employeeAck).length;
  const missingManagerAckCount = scope.filter(d => !d.managerAck).length;

  const blockingErrors: TimesheetReviewIssueKey[] = [];
  const warnings: TimesheetReviewIssueKey[] = [];

  if (incompleteCount > 0) blockingErrors.push('reviewBlockIncomplete');
  if (adjustedNoRemarksCount > 0) blockingErrors.push('reviewBlockAdjustedNoRemarks');
  // Eletropasso: ciência do colaborador é na folha de pagamento, não no espelho PTRP.
  if (missingManagerAckCount > 0) warnings.push('reviewWarnMissingManagerAck');

  const canSubmit = blockingErrors.length === 0 && scope.length > 0;
  const canApprove = blockingErrors.length === 0 && scope.length > 0;

  return {
    canSubmit,
    canApprove,
    blockingErrors,
    warnings,
    incompleteCount,
    adjustedNoRemarksCount,
    missingEmployeeAckCount,
    missingManagerAckCount,
  };
}
