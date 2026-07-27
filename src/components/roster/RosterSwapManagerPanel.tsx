import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { RosterSwapRequest } from '../../types';
import { formatIsoDateBr } from '../../i18n/format';
import { canManageRoster } from '../../utils/roles';

const RosterSwapManagerPanel: React.FC = () => {
  const { t } = useTranslation('mobile');
  const { user } = useAuth();
  const { showToast } = useToast();
  const [pending, setPending] = useState<RosterSwapRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user || !canManageRoster(user.role)) return;
    setLoading(true);
    try {
      const rows = await hrService.listPendingRosterSwaps();
      setPending(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
    const unsub = hrService.subscribe(() => { void load(); });
    return unsub;
  }, [load]);

  if (!user || !canManageRoster(user.role)) return null;
  if (!loading && pending.length === 0) return null;

  const approve = async (id: string) => {
    try {
      await hrService.approveRosterSwap(id, user.id);
      showToast(t('swapApproved'), 'success');
      await load();
    } catch (e) {
      console.error(e);
      showToast(t('swapFailed'), 'error');
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-amber-100 bg-amber-50/50 p-4">
      <h3 className="text-sm font-semibold text-slate-800 mb-3">{t('swapPendingManager')}</h3>
      {loading ? (
        <Loader2 className="animate-spin text-primary" size={24} />
      ) : (
        <ul className="space-y-2">
          {pending.map(req => (
            <li
              key={req.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-slate-100 px-3 py-2 text-sm"
            >
              <span>{formatIsoDateBr(req.workDate)}</span>
              <button
                type="button"
                onClick={() => { void approve(req.id); }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold"
              >
                <CheckCircle2 size={14} /> OK
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RosterSwapManagerPanel;
