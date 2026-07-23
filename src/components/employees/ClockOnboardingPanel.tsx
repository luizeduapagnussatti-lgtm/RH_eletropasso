import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
} from 'lucide-react';
import { Employee, ClockOnboardingStatus } from '../../types';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import { formatPisDisplay } from '../../utils/employeeCredentials';
import { ClockEmployeeGuide } from './ClockEmployeeGuide';

interface Props {
  employee: Employee;
  onRefresh: () => void | Promise<void>;
  onComplete?: () => void;
  compact?: boolean;
}

const STATUS_ORDER: ClockOnboardingStatus[] = [
  'PENDING_EXPORT',
  'PENDING_BIO',
  'READY',
];

function statusStep(status: ClockOnboardingStatus | undefined): number {
  if (!status || status === 'NOT_APPLICABLE') return -1;
  if (status === 'ERROR') return 0;
  if (status === 'PENDING_EXPORT') return 1;
  if (status === 'PENDING_BIO') return 2;
  if (status === 'READY') return 4;
  return 0;
}

export const ClockOnboardingPanel: React.FC<Props> = ({
  employee,
  onRefresh,
  onComplete,
  compact = false,
}) => {
  const { t } = useTranslation('employees');
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [markingBio, setMarkingBio] = useState(false);

  const pis = formatPisDisplay(employee.employeeId);
  const current = employee.clockOnboardingStatus || 'PENDING_EXPORT';
  const step = statusStep(current);

  const copyPis = async () => {
    try {
      await navigator.clipboard.writeText(pis);
      showToast(t('dmprepChecklist.pisCopied'), 'success');
    } catch {
      showToast(t('dmprepChecklist.pisCopyFailed'), 'error');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await hrService.triggerDmprepSync('export-employees', employee.id);
      showToast(
        t('clockOnboarding.exportResult', {
          exported: result.export?.exported ?? 0,
          failed: result.export?.failed ?? 0,
        }),
        (result.export?.failed ?? 0) > 0 ? 'warning' : 'success'
      );
      await onRefresh();
    } catch (e: any) {
      showToast(e?.message || t('clockOnboarding.exportFailed'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const markBioDone = async () => {
    setMarkingBio(true);
    try {
      await hrService.updateProfile(employee.id, {
        clockOnboardingNotes: 'Biometria registrada no relógio — aguardando batida de teste',
      });
      await onRefresh();
      showToast(t('clockOnboarding.bioMarked'), 'success');
    } finally {
      setMarkingBio(false);
    }
  };

  const steps = [
    { key: 'rh', done: step >= 1, title: t('clockOnboarding.stepRh'), detail: t('clockOnboarding.stepRhDetail', { pis }) },
    { key: 'export', done: step >= 2, title: t('clockOnboarding.stepExport'), detail: t('clockOnboarding.stepExportDetail') },
    { key: 'bio', done: (employee.clockOnboardingNotes || '').includes('Biometria') || current === 'READY', title: t('clockOnboarding.stepBio'), detail: t('clockOnboarding.stepBioDetail', { pis }) },
    { key: 'punch', done: current === 'READY', title: t('clockOnboarding.stepPunch'), detail: t('clockOnboarding.stepPunchDetail') },
  ];

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4 mt-2'}>
      {!compact && (
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('clockOnboarding.title')}</h3>
          <p className="text-sm text-slate-500">{t('clockOnboarding.subtitle', { name: employee.name })}</p>
        </div>
      )}

      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        current === 'READY'
          ? 'bg-emerald-100 text-emerald-800'
          : current === 'ERROR'
            ? 'bg-red-100 text-red-800'
            : 'bg-amber-100 text-amber-800'
      }`}>
        {t(`clockOnboarding.status.${current}`)}
      </div>

      <ul className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className="flex gap-3">
            {s.done ? (
              <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
            ) : (
              <Circle className="text-slate-300 shrink-0" size={20} />
            )}
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{i + 1}. {s.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyPis()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm">
          <Copy size={14} />
          {t('dmprepChecklist.copyPis')} ({pis})
        </button>
        {(current === 'PENDING_EXPORT' || current === 'ERROR') && (
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-60"
          >
            {exporting ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
            {t('clockOnboarding.sendToDmprep')}
          </button>
        )}
        {current === 'PENDING_BIO' && (
          <button
            type="button"
            disabled={markingBio}
            onClick={() => void markBioDone()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500 text-emerald-700 text-sm"
          >
            {markingBio ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
            {t('clockOnboarding.markBioDone')}
          </button>
        )}
        <button type="button" onClick={() => void onRefresh()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm">
          <RefreshCw size={14} />
          {t('clockOnboarding.refresh')}
        </button>
      </div>

      {current === 'READY' && onComplete && (
        <button
          type="button"
          onClick={onComplete}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
        >
          <ExternalLink size={14} />
          {t('clockOnboarding.finish')}
        </button>
      )}

      <ClockEmployeeGuide
        mode="admission"
        compact={compact}
        defaultExpanded={!compact}
        employeeName={employee.name}
        employeeId={pis}
      />
    </div>
  );
};

/** Badge for employee directory cards */
export function ClockStatusBadge({ status }: { status?: ClockOnboardingStatus }) {
  const { t } = useTranslation('employees');
  if (!status || status === 'NOT_APPLICABLE') return null;
  const colors: Record<string, string> = {
    PENDING_EXPORT: 'bg-amber-100 text-amber-800',
    PENDING_BIO: 'bg-sky-100 text-sky-800',
    READY: 'bg-emerald-100 text-emerald-800',
    ERROR: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${colors[status] || 'bg-slate-100'}`}>
      {t(`clockOnboarding.badge.${status}`)}
    </span>
  );
}
