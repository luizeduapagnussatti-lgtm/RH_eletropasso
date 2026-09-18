import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, X } from 'lucide-react';
import type { PunchCorrectionRequest } from '../../types';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';

interface Props {
  requests: PunchCorrectionRequest[];
  onClose: () => void;
  onChanged?: () => void;
}

function formatBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export const PunchCorrectionApprovalModal: React.FC<Props> = ({
  requests,
  onClose,
  onChanged,
}) => {
  const { t } = useTranslation('attendance');
  const { showToast } = useToast();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [local, setLocal] = useState(requests);

  const resolve = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const comment = (comments[id] || '').trim();
    if (status === 'REJECTED' && !comment) {
      showToast(t('resolverCommentRequired'), 'error');
      return;
    }
    setBusyId(id);
    try {
      await hrService.resolvePunchCorrection(id, status, comment || undefined);
      setLocal(prev => prev.filter(r => r.id !== id));
      showToast(
        status === 'APPROVED' ? t('punchCorrectionApproved') : t('punchCorrectionRejected'),
        'success',
      );
      onChanged?.();
    } catch {
      showToast(t('punchCorrectionsFailed'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t('pendingPunchCorrections')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('pendingPunchCorrectionsCount', { count: local.length })}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-50 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {local.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">{t('noPendingPunchCorrections')}</p>
          ) : (
            local.map(req => (
              <div key={req.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {req.employeeName || req.employeeId}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{formatBr(req.workDate)}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                    {t('statusPending')}
                  </span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{req.reason}</p>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  {t('resolverComment')}
                </label>
                <textarea
                  className="w-full min-h-[60px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder={t('resolverCommentPlaceholder')}
                  value={comments[req.id] || ''}
                  onChange={e => setComments(prev => ({ ...prev, [req.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => void resolve(req.id, 'REJECTED')}
                    className="flex-1 py-3 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-semibold uppercase tracking-widest hover:bg-rose-100 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {busyId === req.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                    {t('rejectPunchCorrection')}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => void resolve(req.id, 'APPROVED')}
                    className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-semibold uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {busyId === req.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {t('approvePunchCorrection')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-slate-900 text-white text-xs font-semibold uppercase tracking-widest"
          >
            {t('closeLogView')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PunchCorrectionApprovalModal;
