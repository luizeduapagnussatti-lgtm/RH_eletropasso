import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  RefreshCw,
  X,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { hrService } from '../../services/hrService';
import {
  ADMISSION_STEP_COUNT,
  ClockEmployeeGuide,
  DISCHARGE_STEP_COUNT,
} from './ClockEmployeeGuide';

export type DmprepLifecycleType = 'admission' | 'discharge';

interface Props {
  type: DmprepLifecycleType;
  employeeName: string;
  employeeId?: string;
  open: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
}

function stepCount(type: DmprepLifecycleType): number {
  return type === 'admission' ? ADMISSION_STEP_COUNT : DISCHARGE_STEP_COUNT;
}

export const DmprepLifecycleModal: React.FC<Props> = ({
  type,
  employeeName,
  employeeId,
  open,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation('employees');
  const { showToast } = useToast();
  const [checked, setChecked] = useState<boolean[]>(() =>
    Array(stepCount(type)).fill(false),
  );
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      setChecked(Array(stepCount(type)).fill(false));
    }
  }, [open, type]);

  if (!open) return null;

  const toggleStep = (index: number) => {
    setChecked((prev) => prev.map((value, i) => (i === index ? !value : value)));
  };

  const copyPis = async () => {
    if (!employeeId) return;
    try {
      await navigator.clipboard.writeText(employeeId);
      showToast(t('dmprepChecklist.pisCopied'), 'success');
    } catch {
      showToast(t('dmprepChecklist.pisCopyFailed'), 'error');
    }
  };

  const runEmployeeSync = async () => {
    setSyncing(true);
    try {
      const result = await hrService.triggerDmprepSync('employees');
      showToast(
        t('dmprepChecklist.syncResult', {
          created: result.employees?.created ?? 0,
          updated: result.employees?.updated ?? 0,
        }),
        'success',
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : t('dmprepChecklist.syncFailed'),
        'error',
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setConfirming(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : t('operationFailed'),
        'error',
      );
    } finally {
      setConfirming(false);
    }
  };

  const allChecked = checked.every(Boolean);
  const requiresConfirm = type === 'discharge' && Boolean(onConfirm);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dmprep-lifecycle-title"
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 id="dmprep-lifecycle-title" className="text-lg font-bold text-slate-900 dark:text-white">
              {type === 'admission'
                ? t('dmprepChecklist.admissionTitle')
                : t('dmprepChecklist.dischargeTitle')}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t('dmprepChecklist.subtitle', { name: employeeName })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={t('cancel')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/40 text-sm text-amber-900 dark:text-amber-100 flex gap-2 shrink-0">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" aria-hidden />
          <p>{t('dmprepChecklist.warning')}</p>
        </div>

        {employeeId ? (
          <div className="px-6 py-4 flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-700 shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('officialEmployeeId')}
            </span>
            <code className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-mono text-slate-800 dark:text-slate-200">
              {employeeId}
            </code>
            <button
              type="button"
              onClick={copyPis}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
            >
              <Copy size={14} />
              {t('dmprepChecklist.copyPis')}
            </button>
          </div>
        ) : null}

        <div className="p-6 overflow-y-auto flex-1">
          <ClockEmployeeGuide
            mode={type}
            embedded
            highlightFirstStep={type === 'discharge'}
            employeeName={employeeName}
            employeeId={employeeId}
            interactive={{ checked, onToggle: toggleStep }}
          />
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-2 justify-between shrink-0">
          <div className="flex flex-col gap-1">
            {type === 'admission' ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={runEmployeeSync}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? t('dmprepChecklist.syncing') : t('dmprepChecklist.pullFromDmprep')}
                </button>
              </div>
            ) : null}
            {type === 'admission' ? (
              <p className="text-[10px] text-slate-400 max-w-md">{t('dmprepChecklist.pullFromDmprepHint')}</p>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500 self-center">
                <ExternalLink size={14} aria-hidden />
                {t('dmprepChecklist.dmprepHostHint')}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {requiresConfirm ? t('dmprepChecklist.cancelDischarge') : t('dmprepChecklist.done')}
            </button>
            {requiresConfirm ? (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!allChecked || confirming}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {confirming ? t('dmprepChecklist.confirming') : t('dmprepChecklist.confirmDischarge')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
