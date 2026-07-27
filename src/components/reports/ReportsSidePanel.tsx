import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw, AlertCircle, CheckCircle, Mail, Activity,
} from 'lucide-react';
import { EmployeeAttendanceSummary } from '../../types';
import { formatScopeSubtitle } from '../../utils/reportMetrics';
import { formatIsoDateBr } from '../../i18n/format';

interface EmailLog {
  id?: string;
  recipient_email?: string;
  subject?: string;
  status?: string;
  created?: string;
}

interface Props {
  periodPreset: string;
  startDate: string;
  endDate: string;
  employeeCount: number;
  selectedDeptCount: number;
  totalDepts: number;
  singleEmployeeName?: string;
  topAbsent: EmployeeAttendanceSummary[];
  emailLogs: EmailLog[];
  isHookMissing: boolean;
  onRefreshLogs: () => void;
}

export const ReportsSidePanel: React.FC<Props> = ({
  periodPreset,
  startDate,
  endDate,
  employeeCount,
  selectedDeptCount,
  totalDepts,
  singleEmployeeName,
  topAbsent,
  emailLogs,
  isHookMissing,
  onRefreshLogs,
}) => {
  const { t } = useTranslation('reports');
  const periodLabel = t(`presets.${periodPreset}`, { defaultValue: periodPreset });

  const contextLine = formatScopeSubtitle(t, {
    periodLabel,
    startDate: formatIsoDateBr(startDate),
    endDate: formatIsoDateBr(endDate),
    employeeCount,
    deptCount: selectedDeptCount,
    totalDepts,
    singleEmployeeName,
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{t('sidePanel.title')}</h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{contextLine}</p>
          <p className="text-[10px] text-slate-400 mt-2">{t('scope.teamTotalsNote')}</p>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
            {t('sidePanel.topAbsent')}
          </p>
          {topAbsent.length === 0 ? (
            <p className="text-xs text-slate-400 italic">{t('sidePanel.noAbsent')}</p>
          ) : (
            <ul className="space-y-2">
              {topAbsent.map((emp, i) => (
                <li
                  key={emp.employeeId}
                  className="flex items-center justify-between gap-2 rounded-xl bg-rose-50/60 border border-rose-100 px-3 py-2"
                >
                  <span className="text-xs font-medium text-slate-800 truncate">
                    <span className="text-rose-500 font-bold mr-1.5">{i + 1}.</span>
                    {emp.employeeName}
                  </span>
                  <span className="text-xs font-bold text-rose-700 shrink-0">
                    {t('sidePanel.absentDaysCount', { count: emp.absentDays })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Activity size={16} className="text-indigo-500" aria-hidden />
            {t('recentEmailActivity')}
          </h3>
          <button
            type="button"
            onClick={onRefreshLogs}
            className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50"
            title={t('refreshEmailStatus')}
            aria-label={t('refreshEmailStatus')}
          >
            <RefreshCw size={14} aria-hidden />
          </button>
        </div>

        {isHookMissing && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex gap-2">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="text-xs font-semibold text-amber-800">{t('hookMissingTitle')}</p>
              <p className="text-[10px] text-amber-700 mt-0.5">{t('hookMissingHint')}</p>
            </div>
          </div>
        )}

        {emailLogs.length === 0 ? (
          <p className="text-xs text-slate-400 italic">{t('noRecentActivity')}</p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {emailLogs.slice(0, 8).map(log => (
              <li
                key={log.id || `${log.created}-${log.recipient_email}`}
                className="flex items-start gap-2 text-[11px] border-b border-slate-50 pb-2 last:border-0"
              >
                {log.status === 'SENT' ? (
                  <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" aria-hidden />
                ) : log.status === 'FAILED' ? (
                  <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" aria-hidden />
                ) : (
                  <Mail size={14} className="text-slate-400 shrink-0 mt-0.5" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-700 truncate">{log.subject || '—'}</p>
                  <p className="text-slate-400 truncate">{log.recipient_email}</p>
                </div>
                <span className="text-[9px] font-semibold uppercase text-slate-400 shrink-0">
                  {log.status}
                </span>
              </li>
            ))}
          </ul>
        )}

        {emailLogs.some(l => l.status === 'FAILED') && (
          <p className="text-[10px] text-rose-600">{t('emailFailedHint')}</p>
        )}
      </div>
    </div>
  );
};
