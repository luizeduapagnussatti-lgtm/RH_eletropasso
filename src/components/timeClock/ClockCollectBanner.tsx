import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Radio } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useClockCollectSession } from '../../hooks/useClockCollectSession';
import {
  acknowledgeClockCollectResult,
  configureClockCollectFormatters,
  isClockCollectActive,
} from '../../services/clockCollectSession';
import type { DmprepPunchCycleStatus } from '../../services/dmprepSync.service';

/**
 * Global host: keeps punch-collect toasts working after leaving Comunicação,
 * and shows a compact banner while the collect runs.
 */
export const ClockCollectBanner: React.FC<{
  onNavigate?: (path: string) => void;
}> = ({ onNavigate }) => {
  const { t } = useTranslation('hub');
  const { showToast } = useToast();
  const { user } = useAuth();
  const session = useClockCollectSession();
  const lastPhase = useRef(session.phase);

  const canSee =
    user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'HR');

  useEffect(() => {
    configureClockCollectFormatters({
      formatSuccess: (cycle: DmprepPunchCycleStatus) =>
        t('comunicacao.punchesResult', {
          newRecords: cycle.forwarded ?? cycle.collected ?? 0,
          inserted: cycle.inserted ?? 0,
          duplicates: cycle.duplicates ?? 0,
        }),
      formatFailure: (message: string) => {
        if (/collect_timeout/i.test(message)) return t('comunicacao.collectTimeout');
        if (/Failed to fetch|networkerror|abort/i.test(message)) {
          return t('comunicacao.collectNetworkRetry');
        }
        if (/Could not reach the DMPREP|dmprep-sync is running/i.test(message)) {
          return t('comunicacao.serviceDown');
        }
        if (/not configured on this deployment/i.test(message)) {
          return t('comunicacao.notConfigured');
        }
        return message || t('comunicacao.collectFailed');
      },
    });
  }, [t]);

  useEffect(() => {
    if (!canSee) return;
    if (session.phase === lastPhase.current) return;
    const prev = lastPhase.current;
    lastPhase.current = session.phase;

    if (session.phase === 'success' && session.summary && (prev === 'running' || prev === 'starting')) {
      showToast(session.summary, 'success');
      acknowledgeClockCollectResult();
    }
    if (session.phase === 'error' && session.errorMessage && (prev === 'running' || prev === 'starting')) {
      showToast(session.errorMessage || t('comunicacao.collectFailed'), 'error');
      acknowledgeClockCollectResult();
    }
  }, [canSee, session.phase, session.summary, session.errorMessage, showToast, t]);

  if (!canSee || !isClockCollectActive(session.phase)) return null;

  return (
    <div className="mx-4 sm:mx-6 md:mx-10 mt-3 rounded-xl border border-sky-200/80 bg-sky-50 px-4 py-2.5 text-sm text-sky-950 flex flex-wrap items-center gap-3">
      <Loader2 size={16} className="animate-spin shrink-0 text-sky-700" aria-hidden />
      <Radio size={16} className="shrink-0 text-sky-700 hidden sm:block" aria-hidden />
      <p className="flex-1 min-w-0 font-medium">{t('comunicacao.collectRunning')}</p>
      {onNavigate ? (
        <button
          type="button"
          onClick={() => onNavigate('comunicacao')}
          className="text-xs font-bold uppercase tracking-wide text-sky-800 hover:underline"
        >
          {t('comunicacao.collectOpenSync')}
        </button>
      ) : null}
    </div>
  );
};
