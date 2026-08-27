import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Punch, TimesheetDay } from '../../types';
import { pairPunchesToSlots, groupPunchesByDate } from '../../services/punch.service';
import { displayAbsenceMinutes } from '../../utils/timesheetDisplay';
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

/** Compact day list for PWA — full punch detail lives in the PDF download. */
export const MyTimesheetDayCards: React.FC<Props> = ({ days, punches, fmtMinutes }) => {
  const { t } = useTranslation(['mobile', 'ptrp']);

  const punchesByDate = useMemo(() => groupPunchesByDate(punches), [punches]);

  const orderedDays = useMemo(
    () => [...days].sort((a, b) => b.workDate.localeCompare(a.workDate)),
    [days],
  );

  if (orderedDays.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
        {t('mobile:noDays')}
      </p>
    );
  }

  return (
    <ul className="rounded-xl border border-slate-100 dark:border-slate-700/80 bg-white dark:bg-slate-900/60 divide-y divide-slate-100 dark:divide-slate-700/80 overflow-hidden">
      {orderedDays.map((day) => {
        const dayPunches = punchesByDate.get(day.workDate) ?? [];
        const slots = pairPunchesToSlots(dayPunches, day.workDate);
        const punchLine = [slots.entry1, slots.exit1, slots.entry2, slots.exit2]
          .map(formatSlotTime)
          .join(' · ');
        const d = new Date(`${day.workDate}T12:00:00`);
        const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
        const absence = displayAbsenceMinutes(day);
        const hasOt = day.overtimeMinutes > 0;
        const hasAbsence = absence > 0;

        return (
          <li key={day.id} className="px-3.5 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize truncate">
                  {formatIsoDateBr(day.workDate)}
                  <span className="font-medium text-slate-400"> · {weekday}</span>
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                  {t(`ptrp:dayStatus_${day.status}`, { defaultValue: day.status })}
                </p>
              </div>
              <div className="text-right shrink-0 tabular-nums">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {fmtMinutes(day.workedMinutes)}
                </p>
                <p className="text-[10px] mt-0.5 space-x-1.5">
                  {hasOt ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      HE {fmtMinutes(day.overtimeMinutes)}
                    </span>
                  ) : null}
                  {hasAbsence ? (
                    <span className="text-rose-700 dark:text-rose-400 font-semibold">
                      {t('mobile:absenceHours')} {fmtMinutes(absence)}
                    </span>
                  ) : null}
                  {!hasOt && !hasAbsence ? (
                    <span className="text-slate-400">
                      {t('mobile:dayExpected')} {fmtMinutes(day.expectedMinutes || 0)}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <p className="mt-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400 truncate">
              {punchLine}
            </p>
          </li>
        );
      })}
    </ul>
  );
};
