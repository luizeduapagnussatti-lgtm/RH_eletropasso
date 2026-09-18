import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Employee, RosterSwapRequest } from '../../types';
import { formatIsoDateBr } from '../../i18n/format';
import { canManageRoster } from '../../utils/roles';

interface Props {
  /** When false, still loads count but renders nothing (for badge-only consumers). */
  visible?: boolean;
  onPendingCountChange?: (count: number) => void;
}

const RosterSwapManagerPanel: React.FC<Props> = ({
  visible = true,
  onPendingCountChange,
}) => {
  const { t } = useTranslation(['roster', 'mobile']);
  const { user } = useAuth();
  const { showToast } = useToast();
  const [pending, setPending] = useState<RosterSwapRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !canManageRoster(user.role)) return;
    setLoading(true);
    try {
      const [rows, emps] = await Promise.all([
        hrService.listPendingRosterSwaps(),
        hrService.getEmployees().catch(() => [] as Employee[]),
      ]);
      setPending(rows);
      setEmployees(emps);
      onPendingCountChange?.(rows.length);
    } catch (e) {
      console.error(e);
      onPendingCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [user, onPendingCountChange]);

  useEffect(() => {
    void load();
    const unsub = hrService.subscribe(() => {
      void load();
    });
    return unsub;
  }, [load]);

  if (!user || !canManageRoster(user.role)) return null;
  if (!visible) return null;
  if (!loading && pending.length === 0) return null;

  const nameOf = (profileId?: string) => {
    if (!profileId) return '—';
    return employees.find(e => e.id === profileId)?.name || profileId.slice(0, 8);
  };

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      await hrService.approveRosterSwap(id, user.id);
      showToast(t('mobile:swapApproved'), 'success');
      await load();
    } catch (e) {
      console.error(e);
      showToast(t('mobile:swapFailed'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    setBusyId(id);
    try {
      await hrService.rejectRosterSwap(id, user.id);
      showToast(t('mobile:swapRejected'), 'success');
      await load();
    } catch (e) {
      console.error(e);
      showToast(t('mobile:swapFailed'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-4"
      aria-label={t('roster:swapRequestsTitle')}
    >
      <div className="flex items-center gap-2 mb-3">
        <ArrowLeftRight size={18} className="text-amber-700 dark:text-amber-300 shrink-0" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {t('roster:swapRequestsTitle')}
          {!loading && pending.length > 0 ? (
            <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold bg-amber-600 text-white">
              {pending.length}
            </span>
          ) : null}
        </h3>
      </div>
      {loading ? (
        <Loader2 className="animate-spin text-primary" size={24} />
      ) : (
        <ul className="space-y-2">
          {pending.map(req => (
            <li
              key={req.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 px-3 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {formatIsoDateBr(req.workDate)}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                  {nameOf(req.requesterProfileId)}
                  <span className="mx-1 text-slate-400">↔</span>
                  {nameOf(req.targetProfileId)}
                </p>
                {req.reason ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {req.reason}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyId === req.id}
                  onClick={() => {
                    void approve(req.id);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-60 flex-1 sm:flex-none"
                >
                  {busyId === req.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  {t('roster:swapApprove')}
                </button>
                <button
                  type="button"
                  disabled={busyId === req.id}
                  onClick={() => {
                    void reject(req.id);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold disabled:opacity-60 flex-1 sm:flex-none"
                >
                  <XCircle size={14} />
                  {t('roster:swapReject')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default RosterSwapManagerPanel;
