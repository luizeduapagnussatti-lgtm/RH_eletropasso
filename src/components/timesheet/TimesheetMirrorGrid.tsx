import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { Punch, TimesheetDay, User } from '../../types';
import { pairPunchesToSlots, groupPunchesByDate } from '../../services/punch.service';
import { formatIsoDateBr, formatTime, getDateLocale } from '../../i18n/format';

type FmtMinutes = (mins: number) => string;

interface Props {
  days: TimesheetDay[];
  punches: Punch[];
  user: User;
  locked: boolean;
  isHr: boolean;
  isManager: boolean;
  dayStatusLabel: (status: string) => string;
  fmtMinutes: FmtMinutes;
  onAdjust: (day: TimesheetDay) => void;
  onAckEmployee: (dayId: string) => void;
  onAckManager: (dayId: string) => void;
  onRevokeManagerAck: (dayId: string) => void;
}

function formatDayLabel(workDate: string): { primary: string; secondary: string; isWeekend: boolean } {
  const d = new Date(`${workDate}T12:00:00`);
  const locale = getDateLocale();
  const weekday = d.toLocaleDateString(locale, { weekday: 'short' });
  const dayNum = d.getDate().toString().padStart(2, '0');
  const dow = d.getDay();
  return {
    primary: `${dayNum} ${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`,
    secondary: formatIsoDateBr(workDate),
    isWeekend: dow === 0 || dow === 6,
  };
}

function formatSlotTime(iso?: string): string {
  if (!iso) return '—';
  return formatTime(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function overflowTooltip(punches: Punch[]): string {
  return punches.map(p => formatTime(p.punchedAt, { hour: '2-digit', minute: '2-digit', hour12: false })).join(' · ');
}

export const TimesheetMirrorGrid: React.FC<Props> = ({
  days,
  punches,
  user,
  locked,
  isHr,
  isManager,
  dayStatusLabel,
  fmtMinutes,
  onAdjust,
  onAckEmployee,
  onAckManager,
  onRevokeManagerAck,
}) => {
  const { t } = useTranslation('ptrp');

  const punchesByDate = useMemo(() => groupPunchesByDate(punches), [punches]);

  const totals = useMemo(() => ({
    worked: days.reduce((s, d) => s + (d.workedMinutes || 0), 0),
    overtime: days.reduce((s, d) => s + (d.overtimeMinutes || 0), 0),
    absence: days.reduce((s, d) => s + (d.absenceMinutes || 0), 0),
  }), [days]);

  return (
    <div className="min-w-0 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <CalendarDays size={16} className="text-primary shrink-0" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-800">{t('mirrorTitle')}</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm border-collapse">
          <thead className="bg-slate-50 text-slate-500 sticky top-0 z-[1]">
            <tr>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">{t('colDay')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap tabular-nums">{t('colEntry1')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap tabular-nums">{t('colExit1')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap tabular-nums">{t('colEntry2')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap tabular-nums">{t('colExit2')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap tabular-nums">{t('colWorkedShort')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap tabular-nums">{t('colOvertimeShort')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap tabular-nums">{t('absence')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">{t('status')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">{t('managerAckCol')}</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {days.map(day => {
              const dayPunches = punchesByDate.get(day.workDate) ?? [];
              const slots = pairPunchesToSlots(dayPunches, day.workDate);
              const label = formatDayLabel(day.workDate);
              const rowMuted = label.isWeekend ? 'text-rose-700/80' : 'text-slate-800';

              return (
                <tr
                  key={day.id}
                  className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors duration-150 motion-reduce:transition-none"
                >
                  <td className={`px-3 py-2.5 whitespace-nowrap ${rowMuted}`}>
                    <span className="font-semibold block">{label.primary}</span>
                    <span className="text-xs text-slate-500 font-medium tabular-nums">{label.secondary}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-700">
                    {formatSlotTime(slots.entry1)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-700">
                    {formatSlotTime(slots.exit1)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-700">
                    {formatSlotTime(slots.entry2)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      {formatSlotTime(slots.exit2)}
                      {slots.overflow.length > 0 && (
                        <span
                          className="text-[10px] font-semibold text-primary bg-primary-light/60 px-1.5 py-0.5 rounded"
                          title={t('extraPunches', { times: overflowTooltip(slots.overflow) })}
                        >
                          +{slots.overflow.length}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums font-medium text-slate-800">
                    {day.workedMinutes ? fmtMinutes(day.workedMinutes) : '—'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-primary">
                    {day.overtimeMinutes ? fmtMinutes(day.overtimeMinutes) : '—'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                    {day.absenceMinutes ? (
                      <span className="inline-flex px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-medium">
                        {fmtMinutes(day.absenceMinutes)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-medium text-slate-800">{dayStatusLabel(day.status)}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1 items-center">
                      {!day.managerAck && (isManager || isHr) && !locked && (
                        <button
                          type="button"
                          className="text-xs px-2 py-1 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors"
                          onClick={() => onAckManager(day.id)}
                        >
                          {t('managerAck')}
                        </button>
                      )}
                      {day.managerAck && (
                        <>
                          <span className="text-emerald-700 text-xs font-semibold" title={t('managerAck')}>✓</span>
                          {(isManager || isHr) && !locked && (
                            <button
                              type="button"
                              className="text-xs px-2 py-1 border border-amber-200 text-amber-900 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors"
                              onClick={() => onRevokeManagerAck(day.id)}
                            >
                              {t('revokeManagerAck')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {(isHr || isManager) && !locked && (
                      <button
                        type="button"
                        className="text-primary font-semibold text-sm hover:underline"
                        onClick={() => onAdjust(day)}
                      >
                        {t('adjust')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t border-slate-200 text-slate-700">
            <tr>
              <td className="px-3 py-3 font-semibold whitespace-nowrap" colSpan={5}>
                {t('totals')}
              </td>
              <td className="px-3 py-3 font-semibold tabular-nums whitespace-nowrap">
                {fmtMinutes(totals.worked)}
              </td>
              <td className="px-3 py-3 font-semibold tabular-nums whitespace-nowrap text-primary">
                {totals.overtime ? fmtMinutes(totals.overtime) : '—'}
              </td>
              <td className="px-3 py-3 font-semibold tabular-nums whitespace-nowrap">
                {totals.absence ? fmtMinutes(totals.absence) : '—'}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
