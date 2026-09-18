import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { Punch, TimesheetDay, User } from '../../types';
import { pairPunchesToSlots, groupPunchesByDate } from '../../services/punch.service';
import { displayAbsenceMinutes } from '../../utils/timesheetDisplay';
import { isDayApprovable, dayAckBlockI18nKey } from '../../utils/timesheetDayAckValidation';
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
  /** Bulk selection (managed by parent Timesheet page). */
  selectedDayIds?: string[];
  onToggleSelectDay?: (id: string) => void;
  onToggleSelectAll?: () => void;
  allSelected?: boolean;
  bulkToolbar?: React.ReactNode;
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

/** Semantic badge classes for timesheet day status (shared with summary table). */
export function dayStatusBadgeClass(status: string): string {
  switch (status) {
    case 'OK':
      return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'OFF':
    case 'HOLIDAY':
    case 'LEAVE':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    case 'ABSENT':
    case 'LATE':
    case 'INCOMPLETE':
      return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300';
    case 'ADJUSTED':
      return 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
}

const thClass =
  'px-4 py-3 bg-slate-50 dark:bg-slate-950 font-semibold text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wide whitespace-nowrap';
const tdClass = 'px-4 py-3 border-t border-slate-100 dark:border-slate-800 whitespace-nowrap';

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
  selectedDayIds = [],
  onToggleSelectDay,
  onToggleSelectAll,
  allSelected = false,
  bulkToolbar,
}) => {
  const { t } = useTranslation('ptrp');
  const showSelect = isManager && !locked && !!onToggleSelectDay;

  const punchesByDate = useMemo(() => groupPunchesByDate(punches), [punches]);

  const totals = useMemo(() => ({
    worked: days.reduce((s, d) => s + (d.workedMinutes || 0), 0),
    overtime: days.reduce((s, d) => s + (d.overtimeMinutes || 0), 0),
    absence: days.reduce((s, d) => s + displayAbsenceMinutes(d), 0),
  }), [days]);

  return (
    <div className="min-w-0 w-full bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-800">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-primary shrink-0" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('mirrorTitle')}</h2>
        </div>
        {bulkToolbar}
      </div>

      <div className="w-full overflow-x-auto bg-white dark:bg-slate-900">
        <table className="w-full min-w-[44rem] text-left text-sm text-slate-700 dark:text-slate-300 border-collapse">
          <thead className="sticky top-0 z-[1]">
            <tr>
              {showSelect && (
                <th className={`${thClass} w-10`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary rounded border-slate-300"
                    checked={allSelected}
                    disabled={days.length === 0}
                    onChange={onToggleSelectAll}
                    aria-label={t('selectAllVisible')}
                    title={t('selectAllVisible')}
                  />
                </th>
              )}
              <th className={thClass}>{t('colDay')}</th>
              <th className={`${thClass} tabular-nums`}>{t('colEntry1')}</th>
              <th className={`${thClass} tabular-nums`}>{t('colExit1')}</th>
              <th className={`${thClass} tabular-nums`}>{t('colEntry2')}</th>
              <th className={`${thClass} tabular-nums`}>{t('colExit2')}</th>
              <th className={`${thClass} tabular-nums`}>{t('colWorkedShort')}</th>
              <th className={`${thClass} tabular-nums`}>{t('colOvertimeShort')}</th>
              <th className={`${thClass} tabular-nums`}>{t('absence')}</th>
              <th className={thClass}>{t('status')}</th>
              <th className={thClass}>{t('managerAckCol')}</th>
              <th className={`${thClass} sticky right-0 z-[2] shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.25)]`} />
            </tr>
          </thead>
          <tbody>
            {days.map(day => {
              const dayPunches = punchesByDate.get(day.workDate) ?? [];
              const slots = pairPunchesToSlots(dayPunches, day.workDate);
              const label = formatDayLabel(day.workDate);
              const rowMuted = label.isWeekend
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-slate-800 dark:text-slate-100';
              const v = isDayApprovable(day, dayPunches);

              return (
                <tr
                  key={day.id}
                  className={`hover:bg-primary/10 transition-colors duration-150 motion-reduce:transition-none ${
                    label.isWeekend ? 'bg-slate-50 dark:bg-slate-800/50' : ''
                  }`}
                >
                  {showSelect && (
                    <td className={tdClass}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary rounded border-slate-300"
                        checked={selectedDayIds.includes(day.id)}
                        onChange={() => onToggleSelectDay?.(day.id)}
                        aria-label={t('selectDay')}
                      />
                    </td>
                  )}
                  <td className={`${tdClass} ${rowMuted}`}>
                    <span className="font-semibold block">{label.primary}</span>
                    <span className="text-xs text-slate-500 font-medium tabular-nums">{label.secondary}</span>
                  </td>
                  <td className={`${tdClass} tabular-nums text-slate-700 dark:text-slate-300`}>
                    {formatSlotTime(slots.entry1)}
                  </td>
                  <td className={`${tdClass} tabular-nums text-slate-700 dark:text-slate-300`}>
                    {formatSlotTime(slots.exit1)}
                  </td>
                  <td className={`${tdClass} tabular-nums text-slate-700 dark:text-slate-300`}>
                    {formatSlotTime(slots.entry2)}
                  </td>
                  <td className={`${tdClass} tabular-nums text-slate-700 dark:text-slate-300`}>
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
                  <td className={`${tdClass} tabular-nums font-medium text-slate-800 dark:text-slate-100`}>
                    {day.workedMinutes ? fmtMinutes(day.workedMinutes) : '—'}
                  </td>
                  <td className={`${tdClass} tabular-nums text-primary`}>
                    {day.overtimeMinutes ? fmtMinutes(day.overtimeMinutes) : '—'}
                  </td>
                  <td className={`${tdClass} tabular-nums`}>
                    {(() => {
                      const absence = displayAbsenceMinutes(day);
                      if (absence > 0) {
                        return (
                          <span className="inline-flex px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-medium">
                            {fmtMinutes(absence)}
                          </span>
                        );
                      }
                      if (day.status === 'ADJUSTED' || (day.expectedMinutes > 0 && day.workedMinutes > 0)) {
                        return (
                          <span
                            className="inline-flex px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-medium"
                            title={t('absenceClosedHint')}
                          >
                            {fmtMinutes(0)}
                          </span>
                        );
                      }
                      return <span className="text-slate-400">—</span>;
                    })()}
                  </td>
                  <td className={tdClass}>
                    <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${dayStatusBadgeClass(day.status)}`}>
                      {dayStatusLabel(day.status)}
                    </span>
                  </td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-1 items-center">
                      {!day.managerAck && (isManager || isHr) && !locked && (
                        <button
                          type="button"
                          disabled={!v.ok}
                          title={v.ok ? undefined : t(dayAckBlockI18nKey(v.reason || 'unknown'))}
                          className="text-xs px-2 py-1 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                  <td className={`${tdClass} sticky right-0 z-[2] bg-white dark:bg-slate-900 shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.25)]`}>
                    {(isHr || isManager) && !locked && (
                      <button
                        type="button"
                        className="text-primary font-semibold text-sm hover:underline whitespace-nowrap"
                        title={t('adjust')}
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
          <tfoot className="bg-slate-50 border-t border-slate-200 text-slate-700 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-200">
            <tr>
              <td className={`${tdClass} font-semibold`} colSpan={showSelect ? 6 : 5}>
                {t('totals')}
              </td>
              <td className={`${tdClass} font-semibold tabular-nums`}>
                {fmtMinutes(totals.worked)}
              </td>
              <td className={`${tdClass} font-semibold tabular-nums text-primary`}>
                {totals.overtime ? fmtMinutes(totals.overtime) : '—'}
              </td>
              <td className={`${tdClass} font-semibold tabular-nums`}>
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
