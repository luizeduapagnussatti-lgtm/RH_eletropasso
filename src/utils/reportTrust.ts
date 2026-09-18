/**
 * Report coverage helpers — expected working days vs PTRP rows.
 * Used by Reports trust banner.
 */

export type ReportTrustLevel = 'ok' | 'partial' | 'empty' | 'draft';

export interface ReportPeriodTrust {
  level: ReportTrustLevel;
  ptrpRowCount: number;
  coverageRatio: number;
  periodStatuses: string[];
  /** Highest-priority status among overlapping periods (LOCKED > APPROVED > IN_REVIEW > OPEN). */
  primaryStatus: string | null;
}

const STATUS_RANK: Record<string, number> = {
  LOCKED: 4,
  APPROVED: 3,
  IN_REVIEW: 2,
  OPEN: 1,
};

/** Coverage below this ratio (with expected workdays) is treated as insufficient. */
export const REPORT_COVERAGE_WARN_RATIO = 0.1;

export function pickPrimaryPeriodStatus(statuses: string[]): string | null {
  if (!statuses.length) return null;
  let best: string | null = null;
  let bestRank = -1;
  for (const s of statuses) {
    const rank = STATUS_RANK[s] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = s;
    }
  }
  return best;
}

/**
 * @param ptrpRowCount rows from timesheet_days mapped into the filter window
 * @param expectedWorkingDaySlots rough expected slots (employees × working days) — 0 skips ratio
 * @param periodStatuses status codes of overlapping timesheet periods
 */
export function assessReportTrust(input: {
  ptrpRowCount: number;
  expectedWorkingDaySlots: number;
  periodStatuses: string[];
}): ReportPeriodTrust {
  const { ptrpRowCount, expectedWorkingDaySlots, periodStatuses } = input;
  const primaryStatus = pickPrimaryPeriodStatus(periodStatuses);
  const coverageRatio =
    expectedWorkingDaySlots > 0
      ? Math.min(1, ptrpRowCount / expectedWorkingDaySlots)
      : ptrpRowCount > 0
        ? 1
        : 0;

  let level: ReportTrustLevel;
  if (ptrpRowCount === 0) {
    level = 'empty';
  } else if (coverageRatio < REPORT_COVERAGE_WARN_RATIO) {
    level = 'partial';
  } else if (primaryStatus === 'APPROVED' || primaryStatus === 'LOCKED') {
    level = 'ok';
  } else {
    level = 'draft';
  }

  return {
    level,
    ptrpRowCount,
    coverageRatio,
    periodStatuses: [...periodStatuses],
    primaryStatus,
  };
}
