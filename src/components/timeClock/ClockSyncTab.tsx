import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  HelpCircle,
  Loader2,
  RefreshCw,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import { useSubscription } from '../../context/SubscriptionContext';
import type {
  DmprepSyncHistoryEntry,
  DmprepSyncScope,
  DmprepSyncStatusResponse,
} from '../../services/dmprepSync.service';
import { isClockBusyError } from './clockCommandUi';

function mapClockSyncError(message: string, t: (key: string) => string): string {
  if (/Could not reach the DMPREP|dmprep-sync is running/i.test(message)) {
    return t('comunicacao.serviceDown');
  }
  return message;
}

function formatWhen(iso: string | undefined | null, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() < 86_400_000) return '—';
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface ActionCard {
  scope: Extract<DmprepSyncScope, 'punches' | 'employees' | 'all'>;
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
  ctaKey: string;
  primary?: boolean;
}

const ACTIONS: ActionCard[] = [
  { scope: 'punches', icon: Clock3, titleKey: 'comunicacao.collectTitle', descKey: 'comunicacao.collectDesc', ctaKey: 'comunicacao.collectCta', primary: true },
  { scope: 'employees', icon: Users, titleKey: 'comunicacao.sendTitle', descKey: 'comunicacao.sendDesc', ctaKey: 'comunicacao.sendCta' },
  { scope: 'all', icon: RefreshCw, titleKey: 'comunicacao.syncAllTitle', descKey: 'comunicacao.syncAllDesc', ctaKey: 'comunicacao.syncAllCta' },
];

interface Props {
  onBusyChange?: (busy: boolean) => void;
}

export const ClockSyncTab: React.FC<Props> = ({ onBusyChange }) => {
  const { t, i18n } = useTranslation('hub');
  const { showToast } = useToast();
  const { canPerformAction } = useSubscription();
  const canWrite = canPerformAction('write');
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR';

  const [loadingScope, setLoadingScope] = useState<DmprepSyncScope | null>(null);
  const [sessionResult, setSessionResult] = useState<string | null>(null);
  const [status, setStatus] = useState<DmprepSyncStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const next = await hrService.getDmprepSyncStatus();
      setStatus(next);
      setStatusError(null);
    } catch (error) {
      console.error('DMPREP status failed:', error);
      const message = error instanceof Error ? error.message : t('comunicacao.statusLoadFailed');
      setStatusError(mapClockSyncError(message, t));
    } finally {
      setStatusLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 60_000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  const runSync = async (scope: ActionCard['scope']) => {
    if (!canWrite) {
      showToast(t('comunicacao.readOnly'), 'error');
      return;
    }
    setLoadingScope(scope);
    onBusyChange?.(true);
    try {
      const result = await hrService.triggerDmprepSync(scope);
      if (result.busy || isClockBusyError(result.error)) {
        showToast(t('comunicacao.busy'), 'warning');
        return;
      }

      const parts: string[] = [];
      if (result.employees) {
        parts.push(
          t('comunicacao.employeesResult', {
            created: result.employees.created,
            updated: result.employees.updated,
            failed: result.employees.failed,
          }),
        );
      }
      if (result.punches) {
        parts.push(
          t('comunicacao.punchesResult', {
            newRecords: result.punches.newRecords,
            inserted: result.punches.inserted,
            duplicates: result.punches.duplicates,
          }),
        );
        if ((result.punches.skippedPunches ?? 0) > 0) {
          parts.push(
            t('comunicacao.punchesSkipped', {
              count: result.punches.skippedPunches,
              ids: (result.punches.skippedEmployeeIds ?? []).join(', '),
            }),
          );
        }
      }

      const summary = parts.join(' · ') || t('comunicacao.success');
      setSessionResult(summary);
      showToast(summary, 'success');
      if (scope === 'all' || scope === 'employees') {
        hrService.notify();
      }
      await loadStatus();
    } catch (error) {
      console.error('DMPREP sync failed:', error);
      const message = error instanceof Error ? error.message : t('comunicacao.failed');
      if (isClockBusyError(message)) {
        showToast(t('comunicacao.busy'), 'warning');
      } else {
        showToast(mapClockSyncError(message, t), 'error');
      }
      await loadStatus();
    } finally {
      setLoadingScope(null);
      onBusyChange?.(false);
    }
  };

  const isLoading = loadingScope !== null;
  const cycle = status?.lastPunchCycle;
  const cycleOk = cycle ? cycle.success !== false && !cycle.error : null;
  const serviceTone: 'ok' | 'busy' | 'error' | 'idle' = statusError
    ? 'error'
    : status?.busy
      ? 'busy'
      : status?.ok
        ? 'ok'
        : 'idle';

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t('comunicacao.note')}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {ACTIONS.map((action) => (
          <div key={action.scope} className="rounded-2xl border border-slate-100 bg-white p-5 flex flex-col">
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                action.primary ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <action.icon size={24} />
            </span>
            <h2 className="mt-4 text-lg font-bold text-slate-900">{t(action.titleKey)}</h2>
            <p className="mt-1.5 text-sm text-slate-500 leading-relaxed flex-1">{t(action.descKey)}</p>
            <button
              type="button"
              onClick={() => void runSync(action.scope)}
              disabled={isLoading || !canWrite}
              className={`mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 ${
                action.primary
                  ? 'bg-primary text-white hover:bg-primary-hover'
                  : 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <action.icon size={16} className={loadingScope === action.scope ? 'animate-spin' : ''} />
              {loadingScope === action.scope ? t('comunicacao.syncing') : t(action.ctaKey)}
            </button>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-400">
              {t('comunicacao.statusTitle')}
            </h2>
            <p className="text-sm text-slate-500 mt-1">{t('comunicacao.statusDesc')}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadStatus()}
            disabled={statusLoading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={statusLoading ? 'animate-spin' : ''} />
            {t('comunicacao.refreshStatus')}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <StatusTile
            tone={serviceTone}
            title={t('comunicacao.serviceLabel')}
            body={
              serviceTone === 'error'
                ? statusError || t('comunicacao.serviceOffline')
                : serviceTone === 'busy'
                  ? t('comunicacao.serviceBusy')
                  : serviceTone === 'ok'
                    ? t('comunicacao.serviceOnline')
                    : t('comunicacao.serviceUnknown')
            }
          />
          <StatusTile
            tone={
              cycleOk === true ? 'ok' : cycleOk === false ? 'error' : statusLoading ? 'idle' : 'warn'
            }
            title={t('comunicacao.lastPunchTitle')}
            body={
              !cycle
                ? t('comunicacao.lastPunchEmpty')
                : cycleOk === false
                  ? cycle.error || t('comunicacao.lastPunchFailed')
                  : t('comunicacao.lastPunchOk', {
                      inserted: cycle.inserted ?? 0,
                      duplicates: cycle.duplicates ?? 0,
                      when: formatWhen(cycle.finishedAt, locale),
                      trigger: t(`comunicacao.trigger.${cycle.trigger ?? 'unknown'}`),
                    })
            }
          />
        </div>

        {sessionResult && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/80">
                {t('comunicacao.lastResult')}
              </p>
              <p>{sessionResult}</p>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            {t('comunicacao.historyTitle')}
          </h3>
          {statusLoading && !status?.recentSyncs?.length ? (
            <p className="text-sm text-slate-500 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {t('comunicacao.statusLoading')}
            </p>
          ) : !(status?.recentSyncs && status.recentSyncs.length > 0) ? (
            <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
              {t('comunicacao.historyEmpty')}
            </p>
          ) : (
            <ul className="space-y-2">
              {status.recentSyncs.slice(0, 12).map((entry) => (
                <HistoryRow key={entry.id} entry={entry} locale={locale} t={t} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};

function StatusTile({
  tone,
  title,
  body,
}: {
  tone: 'ok' | 'busy' | 'error' | 'idle' | 'warn';
  title: string;
  body: string;
}) {
  const styles: Record<typeof tone, string> = {
    ok: 'border-emerald-100 bg-emerald-50 text-emerald-950',
    busy: 'border-amber-100 bg-amber-50 text-amber-950',
    error: 'border-rose-100 bg-rose-50 text-rose-950',
    warn: 'border-amber-100 bg-amber-50 text-amber-950',
    idle: 'border-slate-100 bg-slate-50 text-slate-800',
  };
  const Icon =
    tone === 'ok'
      ? CheckCircle2
      : tone === 'error'
        ? XCircle
        : tone === 'busy' || tone === 'warn'
          ? AlertTriangle
          : HelpCircle;

  return (
    <div className={`rounded-xl border px-4 py-3 flex gap-3 ${styles[tone]}`}>
      <Icon size={18} className="shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">{title}</p>
        <p className="text-sm font-medium leading-relaxed mt-0.5">{body}</p>
      </div>
    </div>
  );
}

function HistoryRow({
  entry,
  locale,
  t,
}: {
  entry: DmprepSyncHistoryEntry;
  locale: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const ok = entry.success;
  return (
    <li
      className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${
        ok ? 'border-slate-100 bg-slate-50/80' : 'border-rose-100 bg-rose-50/60'
      }`}
    >
      <span className="flex items-center gap-2 shrink-0">
        {ok ? (
          <CheckCircle2 size={14} className="text-emerald-600" />
        ) : (
          <XCircle size={14} className="text-rose-600" />
        )}
        <span className="font-semibold text-slate-800">
          {t(`comunicacao.kind.${entry.kind}`)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-500">
          {t(`comunicacao.trigger.${entry.trigger}`)}
        </span>
      </span>
      <span className="text-slate-600 flex-1 min-w-0">
        {entry.error
          ? entry.error
          : entry.kind === 'employees'
            ? t('comunicacao.historyEmployees', {
                created: entry.employeesCreated ?? 0,
                updated: entry.employeesUpdated ?? 0,
                failed: entry.employeesFailed ?? 0,
              })
            : t('comunicacao.historyPunches', {
                inserted: entry.inserted ?? 0,
                duplicates: entry.duplicates ?? 0,
                forwarded: entry.forwarded ?? entry.collected ?? 0,
              })}
      </span>
      <span className="text-xs text-slate-400 shrink-0 tabular-nums">
        {formatWhen(entry.at, locale)}
      </span>
    </li>
  );
}
