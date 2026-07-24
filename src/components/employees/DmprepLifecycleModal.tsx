import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import {
  DmprepLifecyclePanel,
  type DmprepLifecycleType,
} from './DmprepLifecyclePanel';

interface Props {
  type: DmprepLifecycleType;
  employeeName: string;
  employeeId?: string;
  open: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
}

/** Overlay wrapper around DmprepLifecyclePanel (legacy callers). Prefer EmployeeLifecyclePage. */
export type { DmprepLifecycleType };

export const DmprepLifecycleModal: React.FC<Props> = ({
  type,
  employeeName,
  employeeId,
  open,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation('employees');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dmprep-lifecycle-title"
        className="w-full max-w-2xl relative"
      >
        <div className="flex items-start justify-between gap-4 mb-3 px-1">
          <div>
            <h2 id="dmprep-lifecycle-title" className="text-lg font-bold text-white drop-shadow">
              {type === 'admission'
                ? t('dmprepChecklist.admissionTitle')
                : t('dmprepChecklist.dischargeTitle')}
            </h2>
            <p className="text-sm text-white/80 mt-0.5">
              {t('dmprepChecklist.subtitle', { name: employeeName })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            aria-label={t('cancel')}
          >
            <X size={18} />
          </button>
        </div>
        <DmprepLifecyclePanel
          type={type}
          employeeName={employeeName}
          punchKey={employeeId}
          onCancel={onClose}
          onConfirm={
            onConfirm
              ? async () => {
                  await onConfirm();
                  onClose();
                }
              : undefined
          }
        />
      </div>
    </div>
  );
};
