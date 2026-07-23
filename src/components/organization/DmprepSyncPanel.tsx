import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Users, Clock3, Radio } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useToast } from '../../context/ToastContext';
import { hrService } from '../../services/hrService';
import type { DmprepSyncScope } from '../../services/dmprepSync.service';

export const DmprepSyncPanel: React.FC = () => {
  const { t } = useTranslation('org');
  const { user } = useAuth();
  const { canPerformAction } = useSubscription();
  const { showToast } = useToast();
  const [loadingScope, setLoadingScope] = useState<DmprepSyncScope | null>(null);

  const canManage = Boolean(
    user && ['ADMIN', 'SUPER_ADMIN'].includes(String(user.role)),
  );
  const canWrite = canPerformAction('write');

  // Double-gate: even if rendered, only org admin may sync
  if (!canManage) return null;

  const runSync = async (scope: DmprepSyncScope) => {
    if (!canWrite) {
      showToast(t('dmprepSync.readOnly'), 'error');
      return;
    }

    setLoadingScope(scope);
    try {
      const result = await hrService.triggerDmprepSync(scope);
      if (result.busy) {
        showToast(t('dmprepSync.busy'), 'warning');
        return;
      }

      const parts: string[] = [];
      if (result.employees) {
        parts.push(
          t('dmprepSync.employeesResult', {
            created: result.employees.created,
            updated: result.employees.updated,
            failed: result.employees.failed,
          }),
        );
      }
      if (result.punches) {
        parts.push(
          t('dmprepSync.punchesResult', {
            newRecords: result.punches.newRecords,
            inserted: result.punches.inserted,
            duplicates: result.punches.duplicates,
          }),
        );
        if ((result.punches.skippedPunches ?? 0) > 0) {
          parts.push(
            t('dmprepSync.punchesSkippedWarning', {
              count: result.punches.skippedPunches,
              ids: (result.punches.skippedEmployeeIds ?? []).join(', '),
            }),
          );
        }
      }

      showToast(parts.join(' · ') || t('dmprepSync.success'), 'success');
      if (scope === 'all' || scope === 'employees') {
        hrService.notify();
      }
    } catch (error) {
      console.error('DMPREP sync failed:', error);
      showToast(
        error instanceof Error ? error.message : t('dmprepSync.failed'),
        'error',
      );
    } finally {
      setLoadingScope(null);
    }
  };

  const isLoading = loadingScope !== null;

  return (
    <div className="bg-white p-10 rounded-xl border border-slate-100 shadow-sm space-y-6 animate-in slide-in-from-bottom-8 duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-3">
            <Radio size={24} className="text-primary" />
            {t('dmprepSync.title')}
          </h3>
          <p className="text-sm text-slate-500 mt-2 max-w-3xl">{t('dmprepSync.description')}</p>
        </div>
      </div>

      <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-950 space-y-1">
        <p className="font-semibold">{t('dmprepSync.autoSyncTitle')}</p>
        <p className="text-sky-900/90 leading-relaxed">{t('dmprepSync.autoSyncDetail')}</p>
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t('dmprepSync.note')}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 space-y-3">
          <button
            type="button"
            onClick={() => runSync('all')}
            disabled={isLoading || !canWrite}
            className="inline-flex w-full items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-hover transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={loadingScope === 'all' ? 'animate-spin' : ''} />
            {loadingScope === 'all' ? t('dmprepSync.syncing') : t('dmprepSync.syncAll')}
          </button>
          <p className="text-xs text-slate-600 leading-relaxed">{t('dmprepSync.syncAllHint')}</p>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 space-y-3">
          <button
            type="button"
            onClick={() => runSync('employees')}
            disabled={isLoading || !canWrite}
            className="inline-flex w-full items-center justify-center gap-2 px-5 py-2.5 bg-white text-slate-800 border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all disabled:opacity-50"
          >
            <Users size={16} className={loadingScope === 'employees' ? 'animate-spin' : ''} />
            {loadingScope === 'employees' ? t('dmprepSync.syncing') : t('dmprepSync.syncEmployees')}
          </button>
          <p className="text-xs text-slate-600 leading-relaxed">{t('dmprepSync.syncEmployeesHint')}</p>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 space-y-3">
          <button
            type="button"
            onClick={() => runSync('punches')}
            disabled={isLoading || !canWrite}
            className="inline-flex w-full items-center justify-center gap-2 px-5 py-2.5 bg-white text-slate-800 border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all disabled:opacity-50"
          >
            <Clock3 size={16} className={loadingScope === 'punches' ? 'animate-spin' : ''} />
            {loadingScope === 'punches' ? t('dmprepSync.syncing') : t('dmprepSync.syncPunches')}
          </button>
          <p className="text-xs text-slate-600 leading-relaxed">{t('dmprepSync.syncPunchesHint')}</p>
        </div>
      </div>
    </div>
  );
};
