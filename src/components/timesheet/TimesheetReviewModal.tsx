import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { TimesheetReviewValidation } from '../../utils/timesheetReviewValidation';

type ReviewModalMode = 'submit' | 'approve' | 'lock';

interface Props {
  mode: ReviewModalMode;
  employeeName?: string;
  validation: TimesheetReviewValidation | null;
  lockReadiness?: {
    totalEmployees: number;
    approvedCount: number;
    inReviewCount: number;
    openCount: number;
    canLock: boolean;
  };
  isWorking?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const TimesheetReviewModal: React.FC<Props> = ({
  mode,
  employeeName,
  validation,
  lockReadiness,
  isWorking,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation('ptrp');

  const titleKey =
    mode === 'submit'
      ? 'reviewModalSubmitTitle'
      : mode === 'approve'
        ? 'reviewModalApproveTitle'
        : 'reviewModalLockTitle';

  const introKey =
    mode === 'submit'
      ? 'reviewModalSubmitIntro'
      : mode === 'approve'
        ? 'reviewModalApproveIntro'
        : lockReadiness?.canLock
          ? 'reviewModalLockReadyIntro'
          : 'reviewModalLockForceIntro';

  const canConfirm =
    mode === 'lock'
      ? true
      : mode === 'submit'
        ? validation?.canSubmit
        : validation?.canApprove;

  const errorCount = (key: string, v: TimesheetReviewValidation) => {
    if (key === 'reviewBlockIncomplete') return v.incompleteCount;
    if (key === 'reviewBlockAdjustedNoRemarks') return v.adjustedNoRemarksCount;
    return 0;
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ts-review-modal-title"
    >
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <h2 id="ts-review-modal-title" className="text-lg font-semibold text-slate-900">
              {t(titleKey)}
            </h2>
            {employeeName ? (
              <p className="text-sm text-slate-500 mt-0.5">{employeeName}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={t('common:close')}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">{t(introKey, { name: employeeName ?? '' })}</p>

          {validation && mode !== 'lock' && (
            <div className="space-y-2">
              {validation.blockingErrors.map(key => (
                <div
                  key={key}
                  className="flex gap-2 items-start rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
                >
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden />
                  <span>{t(key, { count: errorCount(key, validation) })}</span>
                </div>
              ))}
              {validation.warnings.map(key => (
                <div
                  key={key}
                  className="flex gap-2 items-start rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                >
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden />
                  <span>{t(key, { count: validation.missingManagerAckCount })}</span>
                </div>
              ))}
              {validation.blockingErrors.length === 0 && validation.warnings.length === 0 && (
                <div className="flex gap-2 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <CheckCircle2 size={16} aria-hidden />
                  <span>{t('reviewModalAllClear')}</span>
                </div>
              )}
            </div>
          )}

          {mode === 'lock' && lockReadiness && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-slate-600">{t('reviewLockApproved')}</span>
                <span className="font-semibold tabular-nums">
                  {lockReadiness.approvedCount}/{lockReadiness.totalEmployees}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-600">{t('reviewLockInReview')}</span>
                <span className="font-semibold tabular-nums">{lockReadiness.inReviewCount}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-600">{t('reviewLockOpen')}</span>
                <span className="font-semibold tabular-nums">{lockReadiness.openCount}</span>
              </div>
              {!lockReadiness.canLock && (
                <p className="text-xs text-amber-800 pt-1 border-t border-slate-200">{t('reviewLockForceHint')}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-slate-100 bg-slate-50/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isWorking}
            className="flex-1 h-11 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {t('common:cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || isWorking}
            className="flex-1 h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50"
          >
            {isWorking
              ? t('reviewModalWorking')
              : mode === 'submit'
                ? t('setInReview')
                : mode === 'approve'
                  ? t('approveEmployee')
                  : lockReadiness?.canLock
                    ? t('setLocked')
                    : t('reviewLockForceConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimesheetReviewModal;
