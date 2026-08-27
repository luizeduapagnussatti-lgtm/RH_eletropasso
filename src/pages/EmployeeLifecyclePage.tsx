import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarDays, Loader2, Trash2 } from 'lucide-react';
import { Employee, TimesheetDay, User } from '../types';
import { hrService } from '../services/hrService';
import { useToast } from '../context/ToastContext';
import {
  canManageEmployeeRecord,
  isStaffAdmin,
  needsClockAdmission,
} from '../utils/roles';
import { formatClockCredentialDisplay, resolveClockCredential } from '../utils/employeeCredentials';
import { DmprepLifecyclePanel } from '../components/employees/DmprepLifecyclePanel';
import { ClockOnboardingPanel } from '../components/employees/ClockOnboardingPanel';
import { HardwareSyncQueuePanel } from '../components/timeClock/HardwareSyncQueuePanel';
import { competenceForDate } from '../utils/payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../constants';
import { pendingDutyAckDays } from '../utils/timesheetScope';

interface Props {
  user: User;
  mode: 'admission' | 'discharge';
  employeeId?: string;
  onNavigate: (path: string, params?: { employeeId?: string; year?: number; month?: number }) => void;
}

function parseIsoLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

async function listTimesheetDaysForEmployee(periodId: string, emp: Employee): Promise<TimesheetDay[]> {
  const keys = [...new Set([emp.employeeId, emp.id].filter(Boolean))] as string[];
  const batches = await Promise.all(keys.map(k => hrService.listTimesheetDays(periodId, k)));
  const byDate = new Map<string, TimesheetDay>();
  for (const batch of batches) {
    for (const day of batch) byDate.set(day.workDate, day);
  }
  return [...byDate.values()];
}

type TimesheetGate = {
  loading: boolean;
  dayCount: number;
  pendingCount: number;
  error: string | null;
};

/**
 * Full-page admission (post-create) or discharge (pre-delete) lifecycle.
 * Closes the clock/DMPREP cycle outside the Equipe grid overlay.
 */
const EmployeeLifecyclePage: React.FC<Props> = ({ user, mode, employeeId, onNavigate }) => {
  const { t } = useTranslation(['employees', 'timeClock']);
  const { showToast } = useToast();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simpleConfirming, setSimpleConfirming] = useState(false);
  const [showSyncQueue, setShowSyncQueue] = useState(false);
  const [terminationDate, setTerminationDate] = useState(
    () => new Date().toISOString().split('T')[0],
  );
  const [timesheetGate, setTimesheetGate] = useState<TimesheetGate>({
    loading: true,
    dayCount: 0,
    pendingCount: 0,
    error: null,
  });

  const goDirectory = () => onNavigate('employees');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!employeeId) {
        setError(t('lifecycle.missingId'));
        setLoading(false);
        return;
      }
      if (!isStaffAdmin(user.role)) {
        setError(t('lifecycle.forbidden'));
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const list = await hrService.getEmployees();
        const found = list.find(e => e.id === employeeId) || null;
        if (!found) {
          if (!cancelled) setError(t('lifecycle.notFound'));
        } else if (!canManageEmployeeRecord(user.role, found.role)) {
          if (!cancelled) setError(t('cannotEditAdmin'));
        } else if (!cancelled) {
          setEmployee(found);
          if (found.terminationDate) setTerminationDate(found.terminationDate);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t('operationFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId, user.role, t]);

  useEffect(() => {
    if (mode !== 'discharge' || !employee || !needsClockAdmission(employee)) return;
    const term = terminationDate;
    const parsed = parseIsoLocal(term);
    if (!parsed) {
      setTimesheetGate({
        loading: false,
        dayCount: 0,
        pendingCount: 0,
        error: t('lifecycle.dischargeTimesheetError'),
      });
      return;
    }
    let cancelled = false;
    setTimesheetGate(g => ({ ...g, loading: true, error: null }));
    void (async () => {
      try {
        const c = competenceForDate(parsed, DEFAULT_PTRP_POLICY.periodStartDay);
        const period = await hrService.getOrCreateTimesheetPeriod(c.year, c.month);
        const days = await listTimesheetDaysForEmployee(period.id, employee);
        const pending = pendingDutyAckDays(days, {
          fromDate: employee.joiningDate || null,
          untilDate: term,
        });
        if (!cancelled) {
          setTimesheetGate({
            loading: false,
            dayCount: days.length,
            pendingCount: pending.length,
            error: null,
          });
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setTimesheetGate({
            loading: false,
            dayCount: 0,
            pendingCount: 0,
            error: e instanceof Error ? e.message : t('lifecycle.dischargeTimesheetError'),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, employee, terminationDate, t]);

  const refreshEmployee = async () => {
    if (!employeeId) return;
    const list = await hrService.getEmployees();
    const fresh = list.find(e => e.id === employeeId) || null;
    setEmployee(fresh);
  };

  const confirmDischarge = async () => {
    if (!employee) return;
    const term = terminationDate || new Date().toISOString().split('T')[0];
    const clockRole = needsClockAdmission(employee);
    if (clockRole) {
      if (
        timesheetGate.loading ||
        timesheetGate.error ||
        timesheetGate.dayCount === 0 ||
        timesheetGate.pendingCount > 0
      ) {
        showToast(t('lifecycle.dischargeTimesheetBlocked'), 'error');
        return;
      }
    }
    setSimpleConfirming(true);
    try {
      await hrService.dischargeEmployee(employee.id, term);
      showToast(t('dmprepChecklist.dischargeComplete', { name: employee.name }), 'success');
      if (clockRole) {
        setShowSyncQueue(true);
        await refreshEmployee();
      } else {
        goDirectory();
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('operationFailed'), 'error');
    } finally {
      setSimpleConfirming(false);
    }
  };

  const openTimesheet = () => {
    if (!employee) return;
    const parsed = parseIsoLocal(terminationDate) || new Date();
    const c = competenceForDate(parsed, DEFAULT_PTRP_POLICY.periodStartDay);
    onNavigate('timesheet', { employeeId: employee.id, year: c.year, month: c.month });
  };

  const title =
    mode === 'admission'
      ? t('dmprepChecklist.admissionTitle')
      : t('dmprepChecklist.dischargeTitle');

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <button
          type="button"
          onClick={goDirectory}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          {t('onboarding.backToDirectory')}
        </button>
        <p className="text-sm text-rose-600" role="alert">
          {error || t('lifecycle.notFound')}
        </p>
      </div>
    );
  }

  const punchKey = employee.employeeId || undefined;
  const clockRole = needsClockAdmission(employee);
  const credDisplay = formatClockCredentialDisplay(
    resolveClockCredential(employee.clockCredential, employee.employeeId)
  );

  // Non-punching accounts: simple delete confirm (no fingerprint checklist)
  if (mode === 'discharge' && !clockRole) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <button
          type="button"
          onClick={goDirectory}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          {t('onboarding.backToDirectory')}
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('lifecycle.simpleDischargeTitle')}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('lifecycle.simpleDischargeHint', { name: employee.name, role: employee.role })}
        </p>
        <div className="space-y-1.5 max-w-xs rounded-2xl border border-primary/30 bg-primary-light/15 p-4">
          <label className="text-[10px] font-semibold text-primary uppercase tracking-widest">
            {t('lastWorkDay')}
          </label>
          <input
            type="date"
            className="w-full px-4 py-3 bg-white border border-primary/25 rounded-xl font-bold text-sm"
            value={terminationDate}
            onChange={e => setTerminationDate(e.target.value)}
          />
          <p className="text-[10px] text-slate-500">{t('lastWorkDayHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={goDirectory}
            className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold"
          >
            {t('dmprepChecklist.cancelDischarge')}
          </button>
          <button
            type="button"
            disabled={simpleConfirming}
            onClick={() => {
              void confirmDischarge();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
          >
            <Trash2 size={16} />
            {simpleConfirming ? t('dmprepChecklist.confirming') : t('dmprepChecklist.confirmDischarge')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <button
        type="button"
        onClick={goDirectory}
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        {t('onboarding.backToDirectory')}
      </button>
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t('dmprepChecklist.subtitle', { name: employee.name })}
        </p>
        {mode === 'admission' ? (
          <p className="text-xs text-slate-400 mt-1">{t('lifecycle.admissionPageHint')}</p>
        ) : (
          <p className="text-xs text-slate-400 mt-1">{t('lifecycle.dischargePageHint')}</p>
        )}
      </div>

      {mode === 'discharge' ? (
        <div className="space-y-4">
          {showSyncQueue ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                {t('timeClock:hardwareSync.dischargePendingHint')}
              </p>
              <HardwareSyncQueuePanel organizationId={user.organizationId} />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={goDirectory}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold"
                >
                  {t('dmprepChecklist.done')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-primary/30 bg-primary-light/15 dark:bg-primary/10 shadow-sm p-5 space-y-2">
                <label className="text-[10px] font-semibold text-primary uppercase tracking-widest">
                  {t('lastWorkDay')}
                </label>
                <input
                  type="date"
                  required
                  className="w-full max-w-xs px-4 py-3 bg-white dark:bg-slate-900 border border-primary/25 rounded-xl font-bold text-sm"
                  value={terminationDate}
                  onChange={e => setTerminationDate(e.target.value)}
                />
                <p className="text-xs text-slate-600 dark:text-slate-300">{t('lastWorkDayHint')}</p>
                <p className="text-xs text-slate-500">{t('lifecycle.dischargeAfterTimesheet')}</p>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    {t('lifecycle.dischargeTimesheetCheck')}
                  </p>
                  {timesheetGate.loading ? (
                    <p className="text-sm text-slate-500 inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      {t('lifecycle.dischargeTimesheetLoading')}
                    </p>
                  ) : timesheetGate.error ? (
                    <p className="text-sm text-rose-600" role="alert">{timesheetGate.error}</p>
                  ) : timesheetGate.dayCount === 0 ? (
                    <p className="text-sm text-amber-800" role="alert">{t('lifecycle.dischargeTimesheetMissing')}</p>
                  ) : timesheetGate.pendingCount > 0 ? (
                    <p className="text-sm text-amber-800" role="alert">
                      {t('lifecycle.dischargeTimesheetPending', { count: timesheetGate.pendingCount })}
                    </p>
                  ) : (
                    <p className="text-sm text-emerald-700 font-medium">{t('lifecycle.dischargeTimesheetReady')}</p>
                  )}
                  <button
                    type="button"
                    onClick={openTimesheet}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-semibold hover:bg-slate-200"
                  >
                    <CalendarDays size={14} />
                    {t('lifecycle.openTimesheet')}
                  </button>
                </div>
              </div>
              <DmprepLifecyclePanel
                type="discharge"
                employeeName={employee.name}
                punchKey={punchKey}
                clockCredential={credDisplay}
                onCancel={goDirectory}
                onConfirm={confirmDischarge}
                confirmDisabled={
                  timesheetGate.loading ||
                  Boolean(timesheetGate.error) ||
                  timesheetGate.dayCount === 0 ||
                  timesheetGate.pendingCount > 0
                }
              />
            </>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            {t('dmprepChecklist.warning')}
          </div>
          <HardwareSyncQueuePanel organizationId={user.organizationId} compact />
          {credDisplay ? (
            <p className="text-xs text-slate-500">
              {t('clockCredential')}:{' '}
              <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">{credDisplay}</code>
              {punchKey && punchKey !== resolveClockCredential(employee.clockCredential, employee.employeeId) ? (
                <span className="ml-2 text-slate-400">
                  ({t('officialEmployeeId')}: {punchKey})
                </span>
              ) : null}
            </p>
          ) : null}
          <ClockOnboardingPanel
            employee={employee}
            onRefresh={refreshEmployee}
            onComplete={goDirectory}
          />
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-end">
            <button
              type="button"
              onClick={goDirectory}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold"
            >
              {t('dmprepChecklist.done')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeLifecyclePage;
