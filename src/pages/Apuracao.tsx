import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw,
  CheckCircle2,
  Lock,
  Undo2,
  CalendarRange,
  BarChart3,
  Wallet,
  ArrowRight,
} from 'lucide-react';
import { hrService } from '../services/hrService';
import { useToast } from '../context/ToastContext';
import { useSubscription } from '../context/SubscriptionContext';
import { TimesheetPeriod, TimesheetPeriodStatus } from '../types';
import { competenceForDate } from '../utils/payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../constants';
import HelpButton from '../components/onboarding/HelpButton';

interface Props {
  user: { id: string; role: string };
  onNavigate: (path: string, params?: any) => void;
}

const STATUS_STYLE: Record<TimesheetPeriodStatus, string> = {
  OPEN: 'bg-slate-100 text-slate-700',
  IN_REVIEW: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  LOCKED: 'bg-slate-800 text-white',
};

const STATUS_LABEL: Record<TimesheetPeriodStatus, string> = {
  OPEN: 'statusOpen',
  IN_REVIEW: 'statusInReview',
  APPROVED: 'statusApproved',
  LOCKED: 'statusLocked',
};

const Apuracao: React.FC<Props> = ({ user, onNavigate }) => {
  const { t } = useTranslation('hub');
  const { t: tPtrp } = useTranslation('ptrp');
  const { showToast } = useToast();
  const { canPerformAction } = useSubscription();
  const canWrite = canPerformAction('write');
  const isAdminHr = user.role === 'ADMIN' || user.role === 'HR';

  const initial = competenceForDate(new Date(), DEFAULT_PTRP_POLICY.periodStartDay);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [period, setPeriod] = useState<TimesheetPeriod | null>(null);
  const [readiness, setReadiness] = useState<Awaited<
    ReturnType<typeof hrService.getTimesheetPeriodLockReadiness>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const periodLabel = `${String(month).padStart(2, '0')}/${year}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await hrService.getOrCreateTimesheetPeriod(year, month);
      setPeriod(p);
      setReadiness(await hrService.getTimesheetPeriodLockReadiness(p.id));
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('apuracao.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [year, month, showToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = period?.status ?? 'OPEN';
  const locked = status === 'LOCKED';

  const handleRecalc = async () => {
    if (!period || locked) return;
    setBusy(true);
    try {
      const count = await hrService.recalculateTimesheetPeriod(year, month);
      showToast(t('apuracao.recalcOk', { count }), 'success');
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('apuracao.recalcFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!period) return;
    if (!window.confirm(t('apuracao.confirmApprove', { period: periodLabel }))) return;
    setBusy(true);
    try {
      await hrService.setTimesheetPeriodStatus(period.id, 'APPROVED', user.id);
      showToast(t('apuracao.approveOk'), 'success');
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('apuracao.statusFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async () => {
    if (!period) return;
    if (!window.confirm(t('apuracao.confirmReopen', { period: periodLabel }))) return;
    setBusy(true);
    try {
      await hrService.setTimesheetPeriodStatus(period.id, 'IN_REVIEW', user.id);
      showToast(t('apuracao.reopenOk'), 'success');
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('apuracao.statusFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleLock = async () => {
    if (!period) return;
    if (!window.confirm(t('apuracao.confirmLock', { period: periodLabel }))) return;
    setBusy(true);
    try {
      const force = !(readiness?.canLock);
      await hrService.lockTimesheetPeriod(period.id, user.id, force);
      showToast(t('apuracao.lockOk'), 'success');
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('apuracao.statusFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdminHr) {
    return (
      <div className="p-6">
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          {t('apuracao.onlyAdminHr')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('apuracao.title')}</h1>
            <HelpButton topic="apuracao.hub" />
          </div>
          <p className="text-sm text-slate-500 mt-1">{t('apuracao.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('ponto')}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {t('apuracao.stepFlow')}
        </button>
      </div>

      {/* Competence + status */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-4">
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase">{tPtrp('year')}</label>
          <input
            type="number"
            className="block w-24 px-3 py-2 border rounded-lg font-bold"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase">{tPtrp('month')}</label>
          <input
            type="number"
            min={1}
            max={12}
            className="block w-20 px-3 py-2 border rounded-lg font-bold"
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-semibold"
        >
          {tPtrp('applyFilters')}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase">{t('apuracao.statusLabel')}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[status]}`}>
            {tPtrp(STATUS_LABEL[status])}
          </span>
        </div>
      </div>

      {/* Status hint */}
      <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
        {t(`apuracao.statusHint${status}`)}
      </p>

      {/* Review counters */}
      {readiness && readiness.totalEmployees > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-slate-100 bg-white px-3 py-3 text-center">
            <p className="text-lg font-bold text-slate-900">{readiness.totalEmployees}</p>
            <p className="text-[11px] text-slate-500">{tPtrp('reviewTotalEmployees', { defaultValue: 'Colaboradores' })}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-center">
            <p className="text-lg font-bold text-emerald-800">{readiness.approvedCount}</p>
            <p className="text-[11px] text-emerald-700">{tPtrp('statusApproved')}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3 text-center">
            <p className="text-lg font-bold text-amber-800">{readiness.inReviewCount}</p>
            <p className="text-[11px] text-amber-700">{tPtrp('statusInReview')}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white px-3 py-3 text-center">
            <p className="text-lg font-bold text-slate-700">{readiness.openCount}</p>
            <p className="text-[11px] text-slate-500">{tPtrp('statusOpen')}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <section className="rounded-xl border border-slate-100 bg-white p-4 space-y-4">
        {locked ? (
          <p className="text-sm text-slate-600 bg-slate-100 rounded-lg px-4 py-3 inline-flex items-center gap-2">
            <Lock size={16} /> {t('apuracao.lockedNote')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || loading || !canWrite}
              onClick={() => void handleRecalc()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
              {busy ? t('apuracao.recalcing') : t('apuracao.recalc')}
            </button>

            {(status === 'OPEN' || status === 'IN_REVIEW') && (
              <button
                type="button"
                disabled={busy || !canWrite}
                onClick={() => void handleApprove()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-800 text-sm font-semibold disabled:opacity-50"
              >
                <CheckCircle2 size={16} /> {t('apuracao.approve')}
              </button>
            )}

            {status === 'APPROVED' && (
              <>
                <button
                  type="button"
                  disabled={busy || !canWrite}
                  onClick={() => void handleReopen()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold disabled:opacity-50"
                >
                  <Undo2 size={16} /> {t('apuracao.reopen')}
                </button>
                <button
                  type="button"
                  disabled={busy || !canWrite}
                  onClick={() => void handleLock()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold disabled:opacity-50"
                >
                  <Lock size={16} /> {t('apuracao.lock')}
                </button>
              </>
            )}
          </div>
        )}

        {/* Cross navigation */}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => onNavigate('timesheet')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold text-slate-700"
          >
            <CalendarRange size={16} /> {t('apuracao.openMirror')}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold text-slate-700"
          >
            <BarChart3 size={16} /> {t('apuracao.openReports')}
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('payroll')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold text-slate-700"
          >
            <Wallet size={16} /> {t('apuracao.goPayroll')}
          </button>
        </div>
      </section>
    </div>
  );
};

export default Apuracao;
