import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Circle,
  Copy,
  RefreshCw,
  X,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { hrService } from '../../services/hrService';

export type DmprepLifecycleType = 'admission' | 'discharge';

interface Props {
  type: DmprepLifecycleType;
  employeeName: string;
  employeeId?: string;
  open: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
}

const STEP_COUNT = 4;

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
  const [checked, setChecked] = useState<boolean[]>(() => Array(STEP_COUNT).fill(false));
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const steps = useMemo(() => {
    const prefix = type === 'admission' ? 'dmprepChecklist.admission' : 'dmprepChecklist.discharge';
    return Array.from({ length: STEP_COUNT }, (_, index) => ({
      title: t(`${prefix}.step${index + 1}.title`),
      detail: t(`${prefix}.step${index + 1}.detail`, {
        name: employeeName,
        employeeId: employeeId || t('notAvailable'),
      }),
    }));
  }, [type, employeeName, employeeId, t]);

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

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {type === 'admission'
                ? t('dmprepChecklist.admissionTitle')
                : t('dmprepChecklist.dischargeTitle')}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {t('dmprepChecklist.subtitle', { name: employeeName })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label={t('cancel')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 text-sm text-amber-900 flex gap-2">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>{t('dmprepChecklist.warning')}</p>
        </div>

        {employeeId ? (
          <div className="px-6 py-4 flex flex-wrap items-center gap-2 border-b border-slate-100">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('officialEmployeeId')}
            </span>
            <code className="px-2 py-1 rounded-lg bg-slate-100 text-sm font-mono text-slate-800">
              {employeeId}
            </code>
            <button
              type="button"
              onClick={copyPis}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              <Copy size={14} />
              {t('dmprepChecklist.copyPis')}
            </button>
          </div>
        ) : null}

        <ul className="p-6 space-y-4 max-h-[50vh] overflow-y-auto">
          {steps.map((step, index) => (
            <li key={step.title}>
              <button
                type="button"
                onClick={() => toggleStep(index)}
                className="w-full flex items-start gap-3 text-left"
              >
                {checked[index] ? (
                  <CheckCircle2 size={20} className="text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <Circle size={20} className="text-slate-300 shrink-0 mt-0.5" />
                )}
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{step.title}</span>
                  <span className="block text-xs text-slate-500 mt-1">{step.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-between">
          <div className="flex flex-wrap gap-2">
            {type === 'admission' ? (
              <button
                type="button"
                onClick={runEmployeeSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-hover disabled:opacity-50"
              >
                <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                {syncing ? t('dmprepChecklist.syncing') : t('dmprepChecklist.pullFromDmprep')}
              </button>
            ) : null}
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 self-center">
              <ExternalLink size={14} />
              {t('dmprepChecklist.dmprepHostHint')}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200"
            >
              {type === 'discharge' && onConfirm
                ? t('dmprepChecklist.cancelDischarge')
                : t('dmprepChecklist.done')}
            </button>
            {type === 'discharge' && onConfirm ? (
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
