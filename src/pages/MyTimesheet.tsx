import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Scale, Wallet } from 'lucide-react';
import { hrService } from '../services/hrService';
import { MyTimesheetDayCards } from '../components/timesheet/MyTimesheetDayCards';
import {
  HourBankLedgerEntry,
  Punch,
  TimesheetDay,
  TimesheetEmployeeReview,
  TimesheetPeriod,
  User,
} from '../types';
import { competenceForDate } from '../utils/payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../constants';

function formatIsoDateBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}` : iso;
}

interface Props {
  user: User;
  onNavigate: (path: string) => void;
}

function fmtMinutes(mins: number, t: (k: string, o?: object) => string) {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  const sign = mins < 0 ? '-' : '';
  return `${sign}${t('ptrp:hoursShort', { h, m })}`;
}

function reviewStatusLabel(status: string | undefined, t: (k: string) => string): string {
  switch (status) {
    case 'IN_REVIEW':
      return t('mobile:reviewStatusInReview');
    case 'EMPLOYEE_SIGNED':
      return t('mobile:reviewStatusEmployeeSigned');
    case 'APPROVED':
      return t('mobile:reviewStatusApproved');
    default:
      return t('mobile:reviewStatusOpen');
  }
}

const MyTimesheet: React.FC<Props> = ({ user }) => {
  const { t } = useTranslation(['mobile', 'ptrp']);
  const initial = competenceForDate(new Date(), DEFAULT_PTRP_POLICY.periodStartDay);

  const [period, setPeriod] = useState<TimesheetPeriod | null>(null);
  const [days, setDays] = useState<TimesheetDay[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [review, setReview] = useState<TimesheetEmployeeReview | null>(null);
  const [bankEnabled, setBankEnabled] = useState<boolean>(DEFAULT_PTRP_POLICY.bankEnabled);
  const [bankBalance, setBankBalance] = useState<number>(0);
  const [bankEntries, setBankEntries] = useState<HourBankLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const entryTypeLabel = useCallback(
    (type: string) => {
      const key = `ptrp:entryTypes.${type}`;
      const translated = t(key);
      return translated === key ? type : translated;
    },
    [t]
  );

  const employeeKey = user.employeeId || user.id;
  const periodLabel = period
    ? `${String(period.month).padStart(2, '0')}/${period.year}`
    : `${String(initial.month).padStart(2, '0')}/${initial.year}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await hrService.getOrCreateTimesheetPeriod(initial.year, initial.month);
      setPeriod(p);
      const [dayList, reviewRow] = await Promise.all([
        hrService.listTimesheetDays(p.id, employeeKey),
        hrService.getTimesheetEmployeeReview(p.id, user.id),
      ]);
      setDays(dayList);
      setReview(reviewRow);
      if (p.startDate && p.endDate) {
        const punchList = await hrService.listPunches({
          employeeId: employeeKey,
          startDate: p.startDate,
          endDate: p.endDate,
        });
        setPunches(punchList);
      }
      const [config, balance, entries] = await Promise.all([
        hrService.getConfig().catch(() => null),
        hrService.getHourBankBalance(employeeKey).catch(() => 0),
        p.startDate && p.endDate
          ? hrService.listHourBankEntries(employeeKey, p.startDate, p.endDate).catch(() => [])
          : Promise.resolve([]),
      ]);
      setBankEnabled(config?.ptrpPolicy?.bankEnabled ?? DEFAULT_PTRP_POLICY.bankEnabled);
      setBankBalance(balance);
      setBankEntries(entries);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [employeeKey, initial.month, initial.year, user.id]);

  useEffect(() => {
    void load();
    const unsub = hrService.subscribe(() => { void load(); });
    return unsub;
  }, [load]);

  const totals = useMemo(
    () => ({
      worked: days.reduce((s, d) => s + d.workedMinutes, 0),
      overtime: days.reduce((s, d) => s + d.overtimeMinutes, 0),
      absence: days.reduce((s, d) => s + d.absenceMinutes, 0),
    }),
    [days]
  );

  const locked = period?.status === 'LOCKED';

  if (loading && !period) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">{t('mobile:myTimesheetTitle')}</h1>
        <p className="text-xs text-slate-500 mt-1">
          {t('mobile:myTimesheetSubtitle', { period: periodLabel })}
        </p>
        <p className="text-[10px] text-slate-400 mt-2">{t('mobile:dataSourceNote')}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-700">
          {reviewStatusLabel(review?.status, t)}
        </span>
        {locked && (
          <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-rose-50 text-rose-700">
            {t('mobile:reviewStatusLocked')}
          </span>
        )}
      </div>

      <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
        {t('mobile:timesheetApprovalNote')}
      </p>

      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
          {t('mobile:periodTotals')}
        </h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[9px] uppercase text-slate-400 font-bold">{t('mobile:workedHours')}</p>
            <p className="text-sm font-semibold tabular-nums">{fmtMinutes(totals.worked, t)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase text-slate-400 font-bold">{t('mobile:overtimeHours')}</p>
            <p className="text-sm font-semibold tabular-nums">{fmtMinutes(totals.overtime, t)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase text-slate-400 font-bold">{t('mobile:absenceHours')}</p>
            <p className="text-sm font-semibold tabular-nums">{fmtMinutes(totals.absence, t)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Scale size={16} className="text-primary shrink-0" aria-hidden />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {t('mobile:hourBankTitle')}
          </h2>
        </div>

        {bankEnabled ? (
          <>
            <p className={`text-2xl font-semibold tabular-nums ${bankBalance < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
              {fmtMinutes(bankBalance, t)}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">{t('mobile:hourBankBalanceLabel')}</p>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
              {bankBalance >= 0 ? t('mobile:hourBankPositiveHint') : t('mobile:hourBankNegativeHint')}
            </p>

            {bankEntries.length > 0 ? (
              <ul className="mt-3 space-y-2 text-xs">
                {bankEntries.slice(-12).reverse().map(e => (
                  <li key={e.id} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                    <span className="text-slate-500 truncate">
                      {formatIsoDateBr(e.entryDate)} · {entryTypeLabel(e.entryType)}
                    </span>
                    <span className={`shrink-0 tabular-nums ${e.minutesDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {e.minutesDelta >= 0 ? '+' : ''}{fmtMinutes(e.minutesDelta, t)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11px] text-slate-400">{t('mobile:hourBankNoEntries')}</p>
            )}
          </>
        ) : (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-3">
            <Wallet size={16} className="text-amber-600 shrink-0 mt-0.5" aria-hidden />
            <p className="text-xs text-amber-800 leading-relaxed">{t('mobile:hourBankDisabledNote')}</p>
          </div>
        )}
      </section>

      <MyTimesheetDayCards
        days={days}
        punches={punches}
        fmtMinutes={m => fmtMinutes(m, t)}
      />

    </div>
  );
};

export default MyTimesheet;
