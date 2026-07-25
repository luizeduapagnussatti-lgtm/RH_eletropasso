import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock3, Users, RefreshCw, CheckCircle2, type LucideIcon } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import { useSubscription } from '../../context/SubscriptionContext';
import type { DmprepSyncScope } from '../../services/dmprepSync.service';
import { isClockBusyError } from './clockCommandUi';

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
  const { t } = useTranslation('hub');
  const { showToast } = useToast();
  const { canPerformAction } = useSubscription();
  const canWrite = canPerformAction('write');

  const [loadingScope, setLoadingScope] = useState<DmprepSyncScope | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

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
      setLastResult(summary);
      showToast(summary, 'success');
      if (scope === 'all' || scope === 'employees') {
        hrService.notify();
      }
    } catch (error) {
      console.error('DMPREP sync failed:', error);
      const message = error instanceof Error ? error.message : t('comunicacao.failed');
      if (isClockBusyError(message)) {
        showToast(t('comunicacao.busy'), 'warning');
      } else {
        showToast(message, 'error');
      }
    } finally {
      setLoadingScope(null);
      onBusyChange?.(false);
    }
  };

  const isLoading = loadingScope !== null;

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

      <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-400">{t('comunicacao.statusTitle')}</h2>
        <p className="text-sm text-slate-500">{t('comunicacao.statusDesc')}</p>
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
          {lastResult ? (
            <>
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {t('comunicacao.lastResult')}
                </p>
                <p className="text-slate-700">{lastResult}</p>
              </div>
            </>
          ) : (
            <p className="text-slate-500">{t('comunicacao.noResultYet')}</p>
          )}
        </div>
      </section>
    </div>
  );
};
