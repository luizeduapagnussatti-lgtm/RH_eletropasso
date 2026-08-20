import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import type { HardwareSyncQueueJob } from '../../types';
import { formatQueueCredential } from '../../services/hardwareSyncQueue.service';
import { isClockBusyError } from './clockCommandUi';

interface Props {
  organizationId?: string;
  onCountChange?: (count: number) => void;
  compact?: boolean;
}

export const HardwareSyncQueuePanel: React.FC<Props> = ({
  organizationId,
  onCountChange,
  compact = false,
}) => {
  const { t } = useTranslation('timeClock');
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<HardwareSyncQueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await hrService.listHardwareSyncPending(organizationId);
      setJobs(data);
      onCountChange?.(data.length);
    } catch (e) {
      console.warn('[HardwareSyncQueuePanel] load failed:', e);
      setJobs([]);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [organizationId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleProcess = async (jobId: string) => {
    setProcessingId(jobId);
    try {
      await hrService.processHardwareSyncCommand(jobId);
      showToast(t('hardwareSync.processOk'), 'success');
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('hardwareSync.processFailed');
      showToast(isClockBusyError(msg) ? t('busy') : msg, 'error');
      await load();
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (jobId: string) => {
    if (!window.confirm(t('hardwareSync.cancelConfirm'))) return;
    try {
      await hrService.cancelHardwareSyncCommand(jobId);
      showToast(t('hardwareSync.cancelOk'), 'success');
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('hardwareSync.processFailed'), 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
        <Loader2 size={16} className="animate-spin" />
        {t('hardwareSync.loading')}
      </div>
    );
  }

  if (jobs.length === 0) {
    if (compact) return null;
    return (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        {t('hardwareSync.empty')}
      </div>
    );
  }

  const commandLabel = (type: string) => {
    if (type === 'ADD_EMPLOYEE') return t('hardwareSync.commandAdd');
    if (type === 'REMOVE_EMPLOYEE') return t('hardwareSync.commandRemove');
    return type;
  };

  const statusLabel = (status: string) => {
    if (status === 'FAILED') return t('hardwareSync.statusFailed');
    if (status === 'IN_PROGRESS') return t('hardwareSync.statusInProgress');
    return t('hardwareSync.statusPending');
  };

  return (
    <div
      className={`rounded-xl border-2 border-amber-300 bg-amber-50 ${compact ? 'p-3' : 'p-4'} space-y-3`}
      role="region"
      aria-label={t('hardwareSync.title')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="text-amber-700 shrink-0" size={20} aria-hidden />
          <div className="min-w-0">
            <h3 className="font-bold text-amber-950 text-sm">
              {t('hardwareSync.title')} ({jobs.length})
            </h3>
            {!compact && (
              <p className="text-xs text-amber-900 mt-0.5">{t('hardwareSync.hint')}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-1.5 rounded-lg text-amber-800 hover:bg-amber-100"
          title={t('refresh')}
          aria-label={t('refresh')}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <ul className="space-y-2">
        {jobs.map((job) => {
          const name = job.targetEmployeeName || String(job.payload.name || '—');
          const busy = processingId === job.id;
          return (
            <li
              key={job.id}
              className="bg-white rounded-lg border border-amber-200 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {commandLabel(job.commandType)}: {name}
                </p>
                <p className="text-[11px] text-slate-600">
                  PIS: {String(job.payload.pis || '—')} ·{' '}
                  <span className="font-semibold text-slate-900">
                    {t('hardwareSync.credential')}: {formatQueueCredential(job.payload)}
                  </span>{' '}
                  · {statusLabel(job.status)} ·{' '}
                  {t('hardwareSync.attempts', {
                    count: job.attemptCount,
                    max: job.maxAttempts,
                  })}
                </p>
                {job.errorMessage ? (
                  <p className="text-[11px] text-rose-700 mt-0.5 truncate" title={job.errorMessage}>
                    {job.errorMessage}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleProcess(job.id)}
                  className="h-8 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                  {busy ? t('running') : t('hardwareSync.processNow')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCancel(job.id)}
                  className="h-8 px-2.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <X size={12} aria-hidden />
                  {t('hardwareSync.cancel')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {!compact && (
        <p className="text-[11px] text-amber-900">{t('hardwareSync.footerHint')}</p>
      )}
    </div>
  );
};
