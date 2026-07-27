import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import { EmployeeAttendanceSummary } from '../../types';
import { buildTeamSummaryMetrics } from '../../utils/reportMetrics';
import { ALL_EMPLOYEES_FILTER } from '../../utils/attendanceUtils';

type SortKey = keyof Pick<
  EmployeeAttendanceSummary,
  | 'employeeName'
  | 'department'
  | 'totalWorkingDays'
  | 'presentDays'
  | 'absentDays'
  | 'lateDays'
  | 'leaveDays'
  | 'halfDays'
  | 'attendancePercentage'
>;

interface Props {
  summaries: EmployeeAttendanceSummary[];
  employeeFilter: string;
}

export const EmployeeSummaryTable: React.FC<Props> = ({ summaries, employeeFilter }) => {
  const { t } = useTranslation('reports');
  const defaultOpen =
    employeeFilter !== ALL_EMPLOYEES_FILTER || summaries.length <= 10;
  const [expanded, setExpanded] = useState(defaultOpen);
  const [sortKey, setSortKey] = useState<SortKey>('absentDays');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...summaries];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return copy;
  }, [summaries, sortKey, sortAsc]);

  const totals = buildTeamSummaryMetrics(summaries).totals;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else {
      setSortKey(key);
      setSortAsc(key === 'employeeName' || key === 'department');
    }
  };

  const columns: { key: SortKey; label: string; align?: 'center' }[] = [
    { key: 'employeeName', label: t('pdf.table.employee') },
    { key: 'department', label: t('pdf.table.dept') },
    { key: 'totalWorkingDays', label: t('pdf.table.workDays'), align: 'center' },
    { key: 'presentDays', label: t('pdf.table.present'), align: 'center' },
    { key: 'absentDays', label: t('pdf.table.absent'), align: 'center' },
    { key: 'lateDays', label: t('pdf.table.late'), align: 'center' },
    { key: 'leaveDays', label: t('pdf.table.leave'), align: 'center' },
    { key: 'halfDays', label: t('pdf.table.half'), align: 'center' },
    { key: 'attendancePercentage', label: t('pdf.table.pct'), align: 'center' },
  ];

  return (
    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50/80 transition-colors"
        aria-expanded={expanded}
      >
        <div>
          <p className="text-sm font-semibold text-slate-800">{t('perEmployeeBreakdown')}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{t('employeeTableHint')}</p>
        </div>
        {expanded ? (
          <ChevronUp size={18} className="text-slate-400 shrink-0" aria-hidden />
        ) : (
          <ChevronDown size={18} className="text-slate-400 shrink-0" aria-hidden />
        )}
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[9px]">
                {columns.map(col => (
                  <th key={col.key} className={`px-3 py-2.5 font-semibold ${col.align === 'center' ? 'text-center' : ''}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`inline-flex items-center gap-1 hover:text-indigo-600 ${col.align === 'center' ? 'mx-auto' : ''}`}
                    >
                      {col.label}
                      <ArrowUpDown size={10} aria-hidden />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map(row => (
                <tr key={row.employeeId} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 font-medium text-slate-800">{row.employeeName}</td>
                  <td className="px-3 py-2 text-slate-600">{row.department}</td>
                  <td className="px-3 py-2 text-center">{row.totalWorkingDays}</td>
                  <td className="px-3 py-2 text-center text-emerald-700">{row.presentDays}</td>
                  <td className="px-3 py-2 text-center text-rose-700 font-medium">{row.absentDays}</td>
                  <td className="px-3 py-2 text-center text-amber-700">{row.lateDays}</td>
                  <td className="px-3 py-2 text-center text-blue-700">{row.leaveDays}</td>
                  <td className="px-3 py-2 text-center text-slate-600">{row.halfDays}</td>
                  <td className="px-3 py-2 text-center font-semibold">{row.attendancePercentage}%</td>
                </tr>
              ))}
              {sorted.length > 0 && (
                <tr className="bg-indigo-50/80 font-bold text-indigo-900 border-t-2 border-indigo-100">
                  <td className="px-3 py-2.5" colSpan={2}>{t('table.totalRow')}</td>
                  <td className="px-3 py-2.5 text-center">{totals.workingDays}</td>
                  <td className="px-3 py-2.5 text-center">{totals.presentDays}</td>
                  <td className="px-3 py-2.5 text-center">{totals.absentDays}</td>
                  <td className="px-3 py-2.5 text-center">{totals.lateDays}</td>
                  <td className="px-3 py-2.5 text-center">{totals.leaveDays}</td>
                  <td className="px-3 py-2.5 text-center">{totals.halfDays}</td>
                  <td className="px-3 py-2.5 text-center">—</td>
                </tr>
              )}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <p className="px-5 py-6 text-center text-slate-400 text-xs">{t('noEmployeeData')}</p>
          )}
        </div>
      )}
    </div>
  );
};
