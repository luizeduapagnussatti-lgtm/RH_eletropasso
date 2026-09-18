import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Loader2, Plus, RefreshCw } from 'lucide-react';
import type { PunchCorrectionRequest, User } from '../types';
import { hrService } from '../services/hrService';
import { useToast } from '../context/ToastContext';
import { MissingPunchesModal } from '../components/attendance/MissingPunchesModal';
import { PunchCorrectionApprovalModal } from '../components/timesheet/PunchCorrectionApprovalModal';
import { isStaffAdmin } from '../utils/roles';

interface Props {
  user: User;
  missingDates?: string[];
  openRequest?: boolean;
}

function formatBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

const STATUS_CLASS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-rose-50 text-rose-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const PunchCorrectionsPage: React.FC<Props> = ({ user, missingDates, openRequest }) => {
  const { t } = useTranslation('attendance');
  const { showToast } = useToast();
  const isManager =
    isStaffAdmin(user.role) || user.role === 'MANAGER' || user.role === 'TEAM_LEAD';

  const [mine, setMine] = useState<PunchCorrectionRequest[]>([]);
  const [pending, setPending] = useState<PunchCorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [requestDates, setRequestDates] = useState<string[]>(missingDates || []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isManager) {
        const [mineRows, pendingRows] = await Promise.all([
          hrService.listMyPunchCorrections(user.id).catch(() => []),
          hrService.listPendingPunchCorrections().catch(() => []),
        ]);
        setMine(mineRows);
        setPending(pendingRows);
      } else {
        const mineRows = await hrService.listMyPunchCorrections(user.id);
        setMine(mineRows);
        setPending([]);
      }
    } catch (e) {
      console.error('[PunchCorrections]', e);
      showToast(t('punchCorrectionsFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [isManager, showToast, t, user.id]);

  useEffect(() => {
    void load();
    const unsub = hrService.subscribe(() => void load());
    return unsub;
  }, [load]);

  useEffect(() => {
    if (openRequest && (missingDates?.length || 0) > 0) {
      setRequestDates(missingDates || []);
      setShowRequestModal(true);
    }
  }, [openRequest, missingDates]);

  const statusLabel = (status: string) => {
    switch (status) {
      case 'PENDING':
        return t('statusPending');
      case 'APPROVED':
        return t('statusApproved');
      case 'REJECTED':
        return t('statusRejected');
      case 'CANCELLED':
        return t('statusCancelled');
      default:
        return status;
    }
  };

  const cancel = async (id: string) => {
    try {
      await hrService.cancelPunchCorrection(id);
      showToast(t('punchCorrectionCancelled'), 'success');
      await load();
    } catch {
      showToast(t('punchCorrectionsFailed'), 'error');
    }
  };

  const title = useMemo(
    () => (isManager ? t('pendingPunchCorrections') : t('myPunchCorrections')),
    [isManager, t],
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('punchCorrectionsSubtitle')}</p>
        </div>
        <div className="flex gap-2">
          {isManager && pending.length > 0 && (
            <button
              type="button"
              onClick={() => setShowApprovalModal(true)}
              className="px-4 py-3 rounded-2xl bg-amber-50 border border-amber-100 text-amber-700 text-xs font-bold uppercase tracking-widest"
            >
              {t('pendingPunchCorrectionsCount', { count: pending.length })}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setRequestDates(requestDates.length ? requestDates : []);
              setShowRequestModal(true);
            }}
            className="px-4 py-3 rounded-2xl bg-primary text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2"
          >
            <Plus size={14} /> {t('requestPunchCorrection')}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="p-3 rounded-2xl bg-white border border-slate-100 text-slate-400"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {isManager && pending.length > 0 && (
        <button
          type="button"
          onClick={() => setShowApprovalModal(true)}
          className="w-full text-left bg-amber-50 border border-amber-100 rounded-xl p-5 flex items-center justify-between gap-4 hover:bg-amber-100/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
              <ClipboardList size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">{t('pendingPunchCorrections')}</p>
              <p className="text-xs text-amber-700/80">
                {t('pendingPunchCorrectionsCount', { count: pending.length })}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-amber-700">
            {t('reviewPunchCorrections')}
          </span>
        </button>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 px-1">
          {t('myPunchCorrections')}
        </h2>
        {loading ? (
          <div className="py-16 flex justify-center text-slate-300">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : mine.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">{t('noMyPunchCorrections')}</div>
        ) : (
          mine.map(req => (
            <div
              key={req.id}
              className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-2"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{formatBr(req.workDate)}</p>
                <span
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${
                    STATUS_CLASS[req.status] || STATUS_CLASS.PENDING
                  }`}
                >
                  {statusLabel(req.status)}
                </span>
              </div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{req.reason}</p>
              {req.resolverComment && (
                <p className="text-xs text-slate-500">
                  <span className="font-semibold">{t('resolverComment')}: </span>
                  {req.resolverComment}
                </p>
              )}
              {req.status === 'PENDING' && (
                <button
                  type="button"
                  onClick={() => void cancel(req.id)}
                  className="text-[10px] font-bold uppercase tracking-widest text-rose-500 hover:text-rose-600"
                >
                  {t('cancelPunchCorrection')}
                </button>
              )}
            </div>
          ))
        )}
      </section>

      {showRequestModal && (
        <MissingPunchesModal
          missingDates={
            requestDates.length
              ? requestDates
              : // Allow manual single-day entry via empty modal hint — prefill yesterday if none
                []
          }
          profileId={user.id}
          employeeId={user.employeeId}
          onClose={() => setShowRequestModal(false)}
          onSubmitted={() => void load()}
        />
      )}

      {showApprovalModal && (
        <PunchCorrectionApprovalModal
          requests={pending}
          onClose={() => setShowApprovalModal(false)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
};

export default PunchCorrectionsPage;
