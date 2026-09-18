/**
 * Report trust assessment.
 * Run: node scripts/test-report-trust.mjs
 */
import assert from 'node:assert/strict';

const REPORT_COVERAGE_WARN_RATIO = 0.1;
const STATUS_RANK = { LOCKED: 4, APPROVED: 3, IN_REVIEW: 2, OPEN: 1 };

function pickPrimaryPeriodStatus(statuses) {
  if (!statuses.length) return null;
  let best = null;
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

function assessReportTrust({ ptrpRowCount, expectedWorkingDaySlots, periodStatuses }) {
  const primaryStatus = pickPrimaryPeriodStatus(periodStatuses);
  const coverageRatio =
    expectedWorkingDaySlots > 0
      ? Math.min(1, ptrpRowCount / expectedWorkingDaySlots)
      : ptrpRowCount > 0
        ? 1
        : 0;

  let level;
  if (ptrpRowCount === 0) level = 'empty';
  else if (coverageRatio < REPORT_COVERAGE_WARN_RATIO) level = 'partial';
  else if (primaryStatus === 'APPROVED' || primaryStatus === 'LOCKED') level = 'ok';
  else level = 'draft';

  return { level, ptrpRowCount, coverageRatio, primaryStatus };
}

assert.equal(assessReportTrust({ ptrpRowCount: 0, expectedWorkingDaySlots: 100, periodStatuses: ['OPEN'] }).level, 'empty');
assert.equal(assessReportTrust({ ptrpRowCount: 5, expectedWorkingDaySlots: 100, periodStatuses: ['OPEN'] }).level, 'partial');
assert.equal(assessReportTrust({ ptrpRowCount: 80, expectedWorkingDaySlots: 100, periodStatuses: ['OPEN'] }).level, 'draft');
assert.equal(assessReportTrust({ ptrpRowCount: 80, expectedWorkingDaySlots: 100, periodStatuses: ['APPROVED'] }).level, 'ok');
assert.equal(pickPrimaryPeriodStatus(['OPEN', 'APPROVED']), 'APPROVED');

console.log('test-report-trust: ok');
