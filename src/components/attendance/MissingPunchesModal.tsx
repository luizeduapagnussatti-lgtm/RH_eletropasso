import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';

interface Props {
  missingDates: string[];
  profileId: string;
  employeeId?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

function formatBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export const MissingPunchesModal: React.FC<Props> = ({
  missingDates,
  profileId,
  employeeId,
  onClose,
  onSubmitted,
}) => {
  const { t } = useTranslation('attendance');
  const { showToast } = useToast();
  const dates = useMemo(
    () => [...new Set(missingDates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort(),
    [missingDates],
  );
  const [reasons, setReasons] = useState<Record<string, string>>(() =>
    Object.fromEntries(dates.map(d => [d, ''])),
  );
  const [extraDate, setExtraDate] = useState('');
  const [localDates, setLocalDates] = useState(dates);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    setLocalDates(dates);
  }, [dates]);

  const addExtraDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(extraDate)) return;
    setLocalDates(prev => (prev.includes(extraDate) ? prev : [...prev, extraDate].sort()));
    setReasons(prev => ({ ...prev, [extraDate]: prev[extraDate] || '' }));
    setExtraDate('');
  };

  const submitOne = async (workDate: string) => {
    const reason = (reasons[workDate] || '').trim();
    if (!reason) {
      showToast(t('punchCorrectionReasonRequired'), 'error');
      return;
    }
    setBusyDate(workDate);
    try {
      await hrService.createPunchCorrection({
        profileId,
        employeeId,
        workDate,
        reason,
      });
      setDone(prev => new Set(prev).add(workDate));
      showToast(t('punchCorrectionCreated'), 'success');
      onSubmitted?.();
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (/duplicate|unique|idx_punch_corr_active/i.test(msg)) {
        showToast(t('punchCorrectionAlreadyPending'), 'error');
      } else {
        showToast(t('punchCorrectionsFailed'), 'error');
      }
    } finally {
      setBusyDate(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t('missingPunchesAlertTitle')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('missingPunchesModalHint')}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-50 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {t('addMissingDate')}
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold"
                value={extraDate}
                onChange={e => setExtraDate(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={addExtraDate}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest"
            >
              {t('addDate')}
            </button>
          </div>

          {localDates.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">{t('noMissingDates')}</p>
          ) : (
            localDates.map(date => {
              const submitted = done.has(date);
              return (
                <div
                  key={date}
                  className={`rounded-xl border p-4 space-y-3 ${
                    submitted ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-100 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{formatBr(date)}</p>
                    {submitted && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                        {t('punchCorrectionSubmittedBadge')}
                      </span>
                    )}
                  </div>
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    {t('punchCorrectionReason')}
                  </label>
                  <textarea
                    disabled={submitted || busyDate === date}
                    className="w-full min-h-[72px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                    placeholder={t('punchCorrectionReasonPlaceholder')}
                    value={reasons[date] || ''}
                    onChange={e => setReasons(prev => ({ ...prev, [date]: e.target.value }))}
                  />
                  {!submitted && (
                    <button
                      type="button"
                      disabled={busyDate === date}
                      onClick={() => void submitOne(date)}
                      className="w-full py-3 rounded-xl bg-primary text-white text-xs font-semibold uppercase tracking-widest hover:bg-primary-hover disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {busyDate === date ? <Loader2 size={14} className="animate-spin" /> : null}
                      {t('requestPunchCorrection')}
                    </button>
                  )}
                </div>
              );
            })
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

export default MissingPunchesModal;
