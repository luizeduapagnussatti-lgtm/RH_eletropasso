import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Clock,
  History,
  Loader2,
  UserCircle,
  Users,
} from 'lucide-react';
import type { Employee, User } from '../../types';
import { hrService } from '../../services/hrService';
import { todayIsoLocal } from '../../utils/payrollPeriod';
import {
  buildManagerTodayAttendance,
  formatPunchHm,
  visibleTeamForManager,
  type ManagerTodayAttendance,
  type ManagerTodayPerson,
} from '../../utils/managerTodayAttendance';
import { PwaInstallTip } from './PwaInstallTip';

const iconChip = 'p-2 rounded-lg bg-[#c41e24]/15 text-[#e23d42] shrink-0';

interface Props {
  user: Employee | User;
  isLoading?: boolean;
  onNavigate: (path: string, params?: Record<string, unknown>) => void;
}

function firstName(full: string): string {
  const part = full.trim().split(/\s+/)[0];
  return part || full;
}

function greetingKey(hour: number): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
  if (hour < 12) return 'greetingMorning';
  if (hour < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}

export const ManagerMobileHome: React.FC<Props> = ({ user, isLoading, onNavigate }) => {
  const { t } = useTranslation('mobile');
  const [data, setData] = useState<ManagerTodayAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowPwaPunch, setAllowPwaPunch] = useState(!!(user as Employee).allowPwaPunch);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAllowPwaPunch(!!(user as Employee).allowPwaPunch);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const allowed = await hrService.getMyAllowPwaPunch();
        if (!cancelled) setAllowPwaPunch(allowed);
      } catch {
        /* keep prop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = todayIsoLocal();
      const [emps, teams, punches, days] = await Promise.all([
        hrService.getEmployees(),
        hrService.getTeams(),
        hrService.listPunches({ startDate: today, endDate: today }).catch(() => []),
        hrService.listTimesheetDaysInRange(today, today).catch(() => []),
      ]);
      const team = visibleTeamForManager({ id: user.id }, emps, teams);
      const summary = buildManagerTodayAttendance({
        team,
        punches,
        today,
        todayDays: days,
      });
      setData(summary);
    } catch (e) {
      console.error('[ManagerMobileHome]', e);
      setError(t('mgrLoadFailed'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [t, user.id]);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = hrService.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 500);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const hour = useMemo(() => new Date().getHours(), []);
  const greet = t(greetingKey(hour), { name: firstName(user.name || '') });
  const busy = isLoading || loading;

  const openPerson = (person: ManagerTodayPerson) => {
    onNavigate('timesheet', { employeeId: person.id });
  };

  return (
    <div className="space-y-5 pb-4 animate-in fade-in duration-500">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#e23d42]">
          {t('mgrEyebrow')}
        </p>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{greet}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('mgrSubtitle')}</p>
      </header>

      <PwaInstallTip />

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {busy && !data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-[#e23d42]" size={28} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-emerald-200/60 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-3 text-center">
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                {data?.present.length ?? 0}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600/80 dark:text-emerald-400/80">
                {t('mgrChipPresent')}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200/60 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-3 text-center">
              <p className="text-lg font-bold text-amber-800 dark:text-amber-200 tabular-nums">
                {data?.missing.length ?? 0}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700/80 dark:text-amber-400/80">
                {t('mgrChipMissing')}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-3 text-center">
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                {data?.teamCount ?? 0}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('mgrChipTeam')}
              </p>
            </div>
          </div>

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={iconChip}>
                <Users size={16} />
              </span>
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {t('mgrPresentTitle')}
              </h2>
              {busy && <Loader2 size={12} className="animate-spin text-[#e23d42]" />}
            </div>
            {!data?.present.length ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 px-1 py-3">{t('mgrPresentEmpty')}</p>
            ) : (
              <ul className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                {data.present.map(p => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => openPerson(p)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800/80"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {p.name}
                        </p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-300 tabular-nums mt-0.5">
                          {p.firstAt && p.lastAt && p.firstAt !== p.lastAt
                            ? t('mgrPunchRange', {
                                first: formatPunchHm(p.firstAt),
                                last: formatPunchHm(p.lastAt),
                              })
                            : p.firstAt
                              ? formatPunchHm(p.firstAt)
                              : '—'}
                          {p.punchCount > 1 ? ` · ${t('mgrPunchCount', { count: p.punchCount })}` : ''}
                        </p>
                      </div>
                      <ArrowRight size={16} className="text-[#e23d42]/60 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={iconChip}>
                <Clock size={16} />
              </span>
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {t('mgrMissingTitle')}
              </h2>
            </div>
            {!data?.missing.length ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 px-1 py-3">{t('mgrMissingEmpty')}</p>
            ) : (
              <ul className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                {data.missing.map(p => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => openPerson(p)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800/80"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {p.name}
                        </p>
                        {p.department && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {p.department}
                          </p>
                        )}
                      </div>
                      <ArrowRight size={16} className="text-[#e23d42]/60 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {(data?.offDuty.length ?? 0) > 0 && (
              <p className="text-[11px] text-slate-400 px-1">
                {t('mgrOffDutyHint', { count: data!.offDuty.length })}
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 px-1">
              {t('mgrShortcuts')}
            </h2>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => onNavigate('timesheet')}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-left"
              >
                <span className={iconChip}>
                  <ClipboardList size={16} />
                </span>
                <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {t('mgrShortcutTimesheet')}
                </span>
                <ArrowRight size={16} className="text-[#e23d42]/60" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('roster')}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-left"
              >
                <span className={iconChip}>
                  <CalendarCheck size={16} />
                </span>
                <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {t('mgrShortcutRoster')}
                </span>
                <ArrowRight size={16} className="text-[#e23d42]/60" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('punch-corrections')}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-left"
              >
                <span className={iconChip}>
                  <ClipboardList size={16} />
                </span>
                <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {t('mgrShortcutPunchCorrections')}
                </span>
                <ArrowRight size={16} className="text-[#e23d42]/60" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('attendance-audit')}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-left"
              >
                <span className={iconChip}>
                  <History size={16} />
                </span>
                <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {t('mgrShortcutAudit')}
                </span>
                <ArrowRight size={16} className="text-[#e23d42]/60" />
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <UserCircle size={16} className="text-slate-400" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {t('mgrMyDay')}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onNavigate('my-timesheet')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              >
                <ClipboardList size={14} />
                {t('mgrMyTimesheet')}
              </button>
              {allowPwaPunch && (
                <button
                  type="button"
                  onClick={() => onNavigate('pwa-punch')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#c41e24] text-white"
                >
                  <Clock size={14} />
                  {t('mgrMyPunch')}
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default ManagerMobileHome;
