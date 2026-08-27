import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarCheck,
  CalendarDays,
  Clock,
  Megaphone,
  PenLine,
  ArrowRight,
} from 'lucide-react';
import type { Employee, User, WorkRosterAssignment } from '../../types';
import { hrService } from '../../services/hrService';
import { isPjContractor } from '../../utils/roles';
import { competenceForDate } from '../../utils/payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../../constants';
import { minutesToDisplay } from '../../utils/durationHm';
import { formatIsoDateBr } from '../../i18n/format';
import { useAnnouncements } from '../../hooks/announcements/useAnnouncements';
import { usePendingTimesheetSign } from '../../hooks/mobile/usePendingTimesheetSign';
import { PwaInstallTip } from './PwaInstallTip';

/** Brand red chip — matches Sidebar chrome icons on management panel. */
const iconChip = 'p-2 rounded-lg bg-[#c41e24]/15 text-[#e23d42] shrink-0';
const iconSolo = 'text-[#e23d42]';
const chevron = 'text-[#e23d42]/60 shrink-0';

interface Props {
  user: Employee | User;
  isLoading?: boolean;
  onNavigate: (path: string, params?: Record<string, unknown>) => void;
}

function isoToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addMonthsIsoRange(from: Date, monthsAhead: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(from.getFullYear(), from.getMonth() + monthsAhead + 1, 0);
  return {
    start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
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

type NextRoster = {
  date: string;
  status: WorkRosterAssignment['status'];
  dayKind: WorkRosterAssignment['dayKind'];
} | null;

type MonthTotals = {
  worked: number;
  overtime: number;
  absence: number;
  periodLabel: string;
} | null;

export const EmployeeMobileHome: React.FC<Props> = ({ user, isLoading, onNavigate }) => {
  const { t } = useTranslation('mobile');
  const isPj = isPjContractor(user);
  const { visibleAnnouncements, isLoading: annLoading } = useAnnouncements(user as User);
  const pendingSign = usePendingTimesheetSign(isPj ? null : (user as User));

  const [nextRoster, setNextRoster] = useState<NextRoster>(null);
  const [totals, setTotals] = useState<MonthTotals>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const employeeKeys = useMemo(
    () => [user.id, (user as Employee).employeeId].filter(Boolean) as string[],
    [user],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setStatusLoading(true);
      const today = isoToday();
      const range = addMonthsIsoRange(new Date(), 1);

      const rosterPromise = hrService
        .listRosterForEmployee(employeeKeys, range.start, range.end)
        .then((rows) => {
          const upcoming = rows
            .filter((r) => r.workDate >= today)
            .sort((a, b) => a.workDate.localeCompare(b.workDate));
          const next = upcoming[0];
          return next
            ? { date: next.workDate, status: next.status, dayKind: next.dayKind }
            : null;
        })
        .catch(() => null);

      const totalsPromise = isPj
        ? Promise.resolve(null as MonthTotals)
        : (async () => {
            try {
              const competence = competenceForDate(new Date(), DEFAULT_PTRP_POLICY.periodStartDay);
              const period = await hrService.getOrCreateTimesheetPeriod(
                competence.year,
                competence.month,
              );
              const employeeKey = (user as Employee).employeeId || user.id;
              const days = await hrService.listTimesheetDays(period.id, employeeKey);
              return {
                worked: days.reduce((s, d) => s + d.workedMinutes, 0),
                overtime: days.reduce((s, d) => s + d.overtimeMinutes, 0),
                absence: days.reduce((s, d) => s + d.absenceMinutes, 0),
                periodLabel: `${String(competence.month).padStart(2, '0')}/${competence.year}`,
              };
            } catch {
              return null;
            }
          })();

      const [roster, monthTotals] = await Promise.all([rosterPromise, totalsPromise]);
      if (cancelled) return;
      setNextRoster(roster);
      setTotals(monthTotals);
      setStatusLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [employeeKeys, isPj, user]);

  const hour = new Date().getHours();
  const greet = t(greetingKey(hour), { name: firstName(user.name) });

  const topAnnouncement = useMemo(() => {
    return [...visibleAnnouncements]
      .sort((a, b) => {
        if (a.priority === 'URGENT' && b.priority !== 'URGENT') return -1;
        if (a.priority !== 'URGENT' && b.priority === 'URGENT') return 1;
        return new Date(b.created).getTime() - new Date(a.created).getTime();
      })[0];
  }, [visibleAnnouncements]);

  const rosterStatusLabel =
    nextRoster?.status === 'WORK'
      ? t('rosterWork')
      : nextRoster?.status === 'OFF'
        ? t('rosterOff')
        : null;

  const rosterKindLabel =
    nextRoster?.dayKind === 'HOLIDAY'
      ? t('rosterHoliday')
      : nextRoster?.dayKind === 'SATURDAY'
        ? t('rosterSaturday')
        : null;

  const metrics = totals
    ? [
        { key: 'worked', label: t('workedHours'), value: minutesToDisplay(totals.worked) },
        { key: 'ot', label: t('overtimeHours'), value: minutesToDisplay(totals.overtime) },
        { key: 'absence', label: t('absenceHours'), value: minutesToDisplay(totals.absence) },
      ]
    : null;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <header className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#e23d42]">
          {t('homeEyebrow')}
        </p>
        {isLoading ? (
          <div className="h-8 w-48 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ) : (
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight text-balance">
            {greet}
          </h1>
        )}
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {user.designation}
          {user.department && user.department !== 'Unassigned'
            ? ` · ${user.department}`
            : ''}
        </p>
      </header>

      <PwaInstallTip />

      {pendingSign && (
        <button
          type="button"
          onClick={() => onNavigate('my-timesheet')}
          className="w-full rounded-xl border border-[#c41e24]/35 bg-[#c41e24]/10 px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
          aria-label={t('pendingSignAction')}
        >
          <div className="flex gap-3 items-start">
            <div className={iconChip} aria-hidden>
              <PenLine size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#c41e24]">{t('pendingSignTitle')}</p>
              <p className="text-xs mt-1 leading-relaxed text-slate-600 dark:text-slate-300">
                {t('pendingSignBody')}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#c41e24]">
                {t('pendingSignAction')}
                <ArrowRight size={14} aria-hidden />
              </span>
            </div>
          </div>
        </button>
      )}

      <section
        className="rounded-xl border border-amber-200/80 bg-amber-50/90 dark:border-amber-500/30 dark:bg-amber-950/40 px-4 py-3.5"
        aria-label={t('punchBlockedTitle')}
      >
        <div className="flex gap-3 items-start">
          <div className={iconChip} aria-hidden>
            <Clock size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              {t('punchBlockedTitle')}
            </p>
            <p className="text-xs mt-1 leading-relaxed text-amber-900/80 dark:text-amber-200/80">
              {t('homeClockReminder')}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-2" aria-label={t('homeStatusTitle')}>
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-0.5">
          {t('homeStatusTitle')}
        </h2>

        <button
          type="button"
          onClick={() => onNavigate('my-roster')}
          className="w-full flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-700/80 bg-white dark:bg-slate-900/60 px-4 py-3 text-left active:scale-[0.99] transition-transform"
        >
          <div className={iconChip} aria-hidden>
            <CalendarCheck size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {t('homeNextRoster')}
            </p>
            {statusLoading ? (
              <div className="mt-1.5 h-4 w-40 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ) : nextRoster ? (
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-0.5">
                {formatIsoDateBr(nextRoster.date)}
                {rosterStatusLabel ? ` · ${rosterStatusLabel}` : ''}
                {rosterKindLabel ? ` · ${rosterKindLabel}` : ''}
              </p>
            ) : (
              <p className="text-sm text-slate-500 mt-0.5">{t('homeNextRosterEmpty')}</p>
            )}
          </div>
          <ArrowRight size={16} className={chevron} aria-hidden />
        </button>

        {!isPj && (
          <button
            type="button"
            onClick={() => onNavigate('my-timesheet')}
            className="w-full rounded-xl border border-slate-100 dark:border-slate-700/80 bg-white dark:bg-slate-900/60 px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
            aria-label={t('homeMonthTotals')}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={iconChip} aria-hidden>
                <Clock size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  {t('homeMonthTotals')}
                </p>
                {totals?.periodLabel ? (
                  <span className="inline-flex mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold tabular-nums bg-[#c41e24]/12 text-[#e23d42]">
                    {totals.periodLabel}
                  </span>
                ) : null}
              </div>
              <ArrowRight size={16} className={chevron} aria-hidden />
            </div>

            {statusLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse"
                  />
                ))}
              </div>
            ) : metrics ? (
              <div className="grid grid-cols-3 gap-2">
                {metrics.map((m) => (
                  <div
                    key={m.key}
                    className="rounded-lg bg-slate-50 dark:bg-slate-800/80 px-2 py-2.5 text-center"
                  >
                    <p className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-50 tracking-tight">
                      {m.value}
                    </p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mt-1 leading-tight">
                      {m.label}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t('homeMonthTotalsEmpty')}</p>
            )}
            <p className="text-[10px] text-slate-400 mt-2.5">{t('homeMonthTotalsHint')}</p>
          </button>
        )}

        <button
          type="button"
          onClick={() => onNavigate('announcements')}
          className="w-full flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-700/80 bg-white dark:bg-slate-900/60 px-4 py-3 text-left active:scale-[0.99] transition-transform"
        >
          <div className={iconChip} aria-hidden>
            <Megaphone size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {t('homeLatestAnnouncement')}
            </p>
            {annLoading ? (
              <div className="mt-1.5 h-4 w-44 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ) : topAnnouncement ? (
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-0.5 line-clamp-2">
                {topAnnouncement.title}
              </p>
            ) : (
              <p className="text-sm text-slate-500 mt-0.5">{t('homeNoAnnouncement')}</p>
            )}
          </div>
          <ArrowRight size={16} className={chevron} aria-hidden />
        </button>
      </section>

      <section className="space-y-2" aria-label={t('homeMoreActions')}>
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-0.5">
          {t('homeMoreActions')}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onNavigate('leave', { autoOpen: true })}
            className="flex flex-col gap-2 p-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-700/80 text-left active:scale-[0.98] transition-transform min-h-[96px]"
          >
            <CalendarDays size={20} className={iconSolo} aria-hidden />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {t('shortcutLeave')}
            </span>
            <span className="text-[10px] text-slate-500 leading-snug">{t('shortcutLeaveHint')}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('announcements')}
            className="flex flex-col gap-2 p-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-700/80 text-left active:scale-[0.98] transition-transform min-h-[96px]"
          >
            <Megaphone size={20} className={iconSolo} aria-hidden />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {t('shortcutAnnouncements')}
            </span>
            <span className="text-[10px] text-slate-500 leading-snug">
              {t('shortcutAnnouncementsHint')}
            </span>
          </button>
        </div>
      </section>
    </div>
  );
};
