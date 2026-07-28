import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Download } from 'lucide-react';
import { payrollReadinessService, PayrollReadinessGap } from '../../services/payrollReadiness.service';

interface Props {
  periodId: string | null;
}

export const PayrollPendenciesPanel: React.FC<Props> = ({ periodId }) => {
  const { t } = useTranslation('payroll');
  const [gaps, setGaps] = useState<PayrollReadinessGap[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!periodId) {
      setGaps([]);
      return;
    }
    setLoading(true);
    try {
      setGaps(await payrollReadinessService.listGapsForPeriod(periodId));
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    const csv = payrollReadinessService.exportGapsCsv(gaps);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pendencias_folha.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!periodId) return null;
  // Hide once resolved — do not keep an amber "Pendências" alert with a green empty state.
  if (gaps.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-amber-950 flex items-center gap-2 text-sm">
            <AlertTriangle size={16} aria-hidden className="text-amber-800 shrink-0" /> {t('pendenciesTitle')}
          </h4>
          <p className="text-xs text-amber-900 mt-1 font-medium">{t('pendenciesHint')}</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-amber-950"
        >
          <Download size={14} aria-hidden /> {t('exportPendenciesCsv')}
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-amber-900">…</p>
      ) : (
        <ul className="text-xs text-amber-950 space-y-1 max-h-40 overflow-y-auto font-medium">
          {gaps.map(g => (
            <li key={g.employeeId}>
              <strong>{g.employeeName}</strong> ({g.dayCount}d)
              {g.missingCpf ? ` — ${t('missingCpf')}` : ''}
              {g.missingPis ? ` — ${t('missingPis')}` : ''}
              {g.missingJoiningDate ? ` — ${t('missingJoiningDate')}` : ''}
              {g.missingTerminationDate ? ` — ${t('missingTerminationDate')}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
