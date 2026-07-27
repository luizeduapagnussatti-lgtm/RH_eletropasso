import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { hrService } from '../services/hrService';
import { MyTimesheetDayCards } from '../components/timesheet/MyTimesheetDayCards';
import {
  Punch,
  TimesheetDay,
  TimesheetEmployeeReview,
  TimesheetPeriod,
  User,
} from '../types';
import { competenceForDate } from '../utils/payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../constants';

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
  const [loading, setLoading] = useState(true);

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

      <MyTimesheetDayCards
        days={days}
        punches={punches}
        fmtMinutes={m => fmtMinutes(m, t)}
      />

    </div>
  );
};

export default MyTimesheet;
