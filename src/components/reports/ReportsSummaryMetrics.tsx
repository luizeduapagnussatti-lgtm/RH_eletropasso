import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users, CheckCircle2, AlertCircle, Clock, FileText, PieChart,
} from 'lucide-react';
import { TeamSummaryMetrics } from '../../utils/reportMetrics';
import { MetricHelpTooltip } from './MetricHelpTooltip';

interface Props {
  metrics: TeamSummaryMetrics;
}

export const ReportsSummaryMetrics: React.FC<Props> = ({ metrics }) => {
  const { t } = useTranslation('reports');
  const n = metrics.employeeCount;

  const dayCards = [
    {
      key: 'present',
      label: t('stats.totalPresent'),
      help: t('metricsHelp.presentDays'),
      value: metrics.totals.presentDays,
      avg: metrics.averages.presentDays,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      icon: CheckCircle2,
    },
    {
      key: 'absent',
      label: t('stats.totalAbsent'),
      help: t('metricsHelp.absentDays'),
      value: metrics.totals.absentDays,
      avg: metrics.averages.absentDays,
      color: 'bg-rose-50 text-rose-700 border-rose-100',
      icon: AlertCircle,
    },
    {
      key: 'late',
      label: t('stats.totalLate'),
      help: t('metricsHelp.lateDays'),
      value: metrics.totals.lateDays,
      avg: metrics.averages.lateDays,
      color: 'bg-amber-50 text-amber-700 border-amber-100',
      icon: Clock,
    },
    {
      key: 'leave',
      label: t('stats.totalLeave'),
      help: t('metricsHelp.leaveDays'),
      value: metrics.totals.leaveDays,
      avg: metrics.averages.leaveDays,
      color: 'bg-blue-50 text-blue-700 border-blue-100',
      icon: FileText,
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <div className="bg-indigo-50 text-indigo-700 border-indigo-100 rounded-2xl p-4 border text-center">
        <Users size={18} className="mx-auto mb-1.5 opacity-60" aria-hidden />
        <p className="text-2xl font-bold">{n}</p>
        <p className="text-[8px] font-semibold uppercase tracking-wider mt-0.5">
          {t('stats.employees')}
        </p>
        <p className="text-[9px] text-indigo-600/80 mt-1">{t('scope.inScope')}</p>
      </div>

      {dayCards.map(card => (
        <div key={card.key} className={`${card.color} rounded-2xl p-4 border`}>
          <card.icon size={18} className="mx-auto mb-1.5 opacity-60" aria-hidden />
          <p className="text-2xl font-bold text-center">{card.value}</p>
          <p className="text-[8px] font-semibold uppercase tracking-wider mt-0.5 text-center leading-snug">
            <MetricHelpTooltip label={card.label} helpText={card.help} />
          </p>
          <p className="text-[9px] opacity-80 mt-1.5 text-center leading-snug">
            {t('stats.teamTotal', { count: n })}
          </p>
          <p className="text-[9px] font-medium opacity-90 text-center">
            {t('stats.avgPerEmployee', { avg: card.avg })}
          </p>
        </div>
      ))}

      <div className="bg-slate-100 text-slate-700 border-slate-200 rounded-2xl p-4 border">
        <PieChart size={18} className="mx-auto mb-1.5 opacity-60" aria-hidden />
        <p className="text-2xl font-bold text-center">
          {n > 0 ? `${metrics.avgAttendancePct}%` : '—'}
        </p>
        <p className="text-[8px] font-semibold uppercase tracking-wider mt-0.5 text-center leading-snug">
          <MetricHelpTooltip
            label={t('stats.avgAttendanceFull')}
            helpText={t('metricsHelp.attendancePct')}
          />
        </p>
        <p className="text-[9px] opacity-70 mt-1.5 text-center">{t('stats.unweightedAvg')}</p>
      </div>
    </div>
  );
};
