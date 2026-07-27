import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Punch, TimesheetDay } from '../../types';
import { pairPunchesToSlots, groupPunchesByDate } from '../../services/punch.service';
import { formatIsoDateBr, formatTime } from '../../i18n/format';

interface Props {
  days: TimesheetDay[];
  punches: Punch[];
  fmtMinutes: (mins: number) => string;
}

function formatSlotTime(iso?: string): string {
  if (!iso) return '—';
  return formatTime(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export const MyTimesheetDayCards: React.FC<Props> = ({ days, punches, fmtMinutes }) => {
  const { t } = useTranslation(['mobile', 'ptrp']);

  const punchesByDate = useMemo(() => groupPunchesByDate(punches), [punches]);

  if (days.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-8 text-center">{t('mobile:noDays')}</p>
    );
  }

  return (
    <div className="space-y-3">
      {days.map(day => {
        const dayPunches = punchesByDate.get(day.workDate) ?? [];
        const slots = pairPunchesToSlots(dayPunches, day.workDate);
        const d = new Date(`${day.workDate}T12:00:00`);
        const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });

        return (
          <article
            key={day.id}
            className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 capitalize">
                  {formatIsoDateBr(day.workDate)} · {weekday}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                  {t(`ptrp:dayStatus_${day.status}`, { defaultValue: day.status })}
                </p>
              </div>
              <span className="text-xs font-semibold text-primary tabular-nums">
                {fmtMinutes(day.workedMinutes)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <span className="text-slate-400 block text-[9px] uppercase">{t('ptrp:colEntry1')}</span>
                <span className="font-semibold tabular-nums">{formatSlotTime(slots.entry1)}</span>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <span className="text-slate-400 block text-[9px] uppercase">{t('ptrp:colExit1')}</span>
                <span className="font-semibold tabular-nums">{formatSlotTime(slots.exit1)}</span>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <span className="text-slate-400 block text-[9px] uppercase">{t('ptrp:colEntry2')}</span>
                <span className="font-semibold tabular-nums">{formatSlotTime(slots.entry2)}</span>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <span className="text-slate-400 block text-[9px] uppercase">{t('ptrp:colExit2')}</span>
                <span className="font-semibold tabular-nums">{formatSlotTime(slots.exit2)}</span>
              </div>
            </div>

            {(day.overtimeMinutes > 0 || day.absenceMinutes > 0) && (
              <div className="flex flex-wrap gap-2 mt-2 text-[10px] font-semibold">
                {day.overtimeMinutes > 0 && (
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    HE {fmtMinutes(day.overtimeMinutes)}
                  </span>
                )}
                {day.absenceMinutes > 0 && (
                  <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                    {t('mobile:absenceHours')} {fmtMinutes(day.absenceMinutes)}
                  </span>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};
