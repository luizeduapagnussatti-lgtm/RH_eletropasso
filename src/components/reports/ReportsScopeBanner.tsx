import React from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { formatScopeSubtitle } from '../../utils/reportMetrics';
import { formatIsoDateBr } from '../../i18n/format';

interface Props {
  periodPreset: string;
  startDate: string;
  endDate: string;
  employeeCount: number;
  selectedDeptCount: number;
  totalDepts: number;
  singleEmployeeName?: string;
}

export const ReportsScopeBanner: React.FC<Props> = ({
  periodPreset,
  startDate,
  endDate,
  employeeCount,
  selectedDeptCount,
  totalDepts,
  singleEmployeeName,
}) => {
  const { t } = useTranslation('reports');
  const periodLabel = t(`presets.${periodPreset}`, { defaultValue: periodPreset });

  const subtitle = formatScopeSubtitle(t, {
    periodLabel,
    startDate: formatIsoDateBr(startDate),
    endDate: formatIsoDateBr(endDate),
    employeeCount,
    deptCount: selectedDeptCount,
    totalDepts,
    singleEmployeeName,
  });

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 flex gap-3 items-start">
      <Info size={18} className="text-indigo-600 shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold text-indigo-900">{t('scope.title')}</p>
        <p className="text-[11px] text-indigo-800/90 leading-relaxed">{subtitle}</p>
        <p className="text-[10px] text-indigo-700/70">{t('scope.clockFacingNote')}</p>
      </div>
    </div>
  );
};
