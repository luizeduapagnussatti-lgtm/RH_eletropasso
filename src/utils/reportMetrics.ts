import { EmployeeAttendanceSummary } from '../types';

export type TeamSummaryMetrics = {
  employeeCount: number;
  totals: {
    presentDays: number;
    absentDays: number;
    lateDays: number;
    leaveDays: number;
    halfDays: number;
    workingDays: number;
  };
  averages: {
    presentDays: number;
    absentDays: number;
    lateDays: number;
    leaveDays: number;
    halfDays: number;
  };
  avgAttendancePct: number;
};

export function buildTeamSummaryMetrics(
  summaries: EmployeeAttendanceSummary[]
): TeamSummaryMetrics {
  const n = summaries.length;
  const sum = (pick: (s: EmployeeAttendanceSummary) => number) =>
    summaries.reduce((acc, s) => acc + pick(s), 0);

  const totals = {
    presentDays: sum(s => s.presentDays),
    absentDays: sum(s => s.absentDays),
    lateDays: sum(s => s.lateDays),
    leaveDays: sum(s => s.leaveDays),
    halfDays: sum(s => s.halfDays),
    workingDays: sum(s => s.totalWorkingDays),
  };

  const avg = (total: number) => (n > 0 ? Math.round((total / n) * 10) / 10 : 0);

  const avgAttendancePct =
    n > 0
      ? Math.round(sum(s => s.attendancePercentage) / n)
      : 0;

  return {
    employeeCount: n,
    totals,
    averages: {
      presentDays: avg(totals.presentDays),
      absentDays: avg(totals.absentDays),
      lateDays: avg(totals.lateDays),
      leaveDays: avg(totals.leaveDays),
      halfDays: avg(totals.halfDays),
    },
    avgAttendancePct,
  };
}

export function topEmployeesByAbsentDays(
  summaries: EmployeeAttendanceSummary[],
  limit = 3
): EmployeeAttendanceSummary[] {
  return [...summaries]
    .sort((a, b) => b.absentDays - a.absentDays || a.employeeName.localeCompare(b.employeeName))
    .filter(s => s.absentDays > 0)
    .slice(0, limit);
}

export function formatScopeSubtitle(
  t: (key: string, opts?: Record<string, unknown>) => string,
  opts: {
    periodLabel: string;
    startDate: string;
    endDate: string;
    employeeCount: number;
    deptCount: number;
    totalDepts: number;
    singleEmployeeName?: string;
  }
): string {
  const period = t('scope.periodLine', {
    preset: opts.periodLabel,
    start: opts.startDate,
    end: opts.endDate,
  });
  if (opts.singleEmployeeName) {
    return `${period} · ${t('scope.singleEmployee', { name: opts.singleEmployeeName })}`;
  }
  return `${period} · ${t('scope.teamLine', {
    count: opts.employeeCount,
    depts: opts.deptCount,
    totalDepts: opts.totalDepts,
  })}`;
}
