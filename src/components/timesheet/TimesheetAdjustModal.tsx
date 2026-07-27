import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Clock, Edit3, Info, X } from 'lucide-react';
import { Punch, TimesheetDay } from '../../types';
import { pairPunchesToSlots } from '../../services/punch.service';
import { formatIsoDateBr, formatTime } from '../../i18n/format';

export interface TimesheetAdjustValues {
  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  absenceMinutes: number;
  remarks: string;
}

interface Props {
  day: TimesheetDay;
  punches: Punch[];
  employeeName: string;
  dayStatusLabel: (status: string) => string;
  fmtMinutes: (mins: number) => string;
  onClose: () => void;
  onSave: (values: TimesheetAdjustValues) => Promise<void>;
}

interface DurationParts {
  h: number;
  m: number;
}

function minutesToParts(mins: number): DurationParts {
  const abs = Math.abs(mins);
  return { h: Math.floor(abs / 60), m: abs % 60 };
}

function partsToMinutes({ h, m }: DurationParts): number {
  return Math.max(0, h) * 60 + Math.min(59, Math.max(0, m));
}

function formatSlotTime(iso?: string): string {
  if (!iso) return '—';
  return formatTime(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
}

interface DurationFieldProps {
  id: string;
  label: string;
  hint: string;
  value: DurationParts;
  onChange: (next: DurationParts) => void;
  originalMinutes: number;
  fmtMinutes: (mins: number) => string;
  accent?: 'default' | 'primary' | 'amber' | 'rose';
}

const accentRing: Record<NonNullable<DurationFieldProps['accent']>, string> = {
  default: 'focus-within:ring-primary/20 focus-within:border-primary/40',
  primary: 'focus-within:ring-primary/25 focus-within:border-primary/50',
  amber: 'focus-within:ring-amber-200 focus-within:border-amber-300',
  rose: 'focus-within:ring-rose-200 focus-within:border-rose-300',
};

function DurationField({
  id,
  label,
  hint,
  value,
  onChange,
  originalMinutes,
  fmtMinutes,
  accent = 'default',
}: DurationFieldProps) {
  const { t } = useTranslation('ptrp');
  const currentMinutes = partsToMinutes(value);
  const changed = currentMinutes !== originalMinutes;

  return (
    <div className="h-full flex flex-col rounded-xl border border-slate-100 bg-white p-4 gap-3">
      <div className="min-h-[3.25rem]">
        <label htmlFor={`${id}-h`} className="block text-xs font-semibold text-slate-700 leading-snug">
          {label}
        </label>
        <p className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2">{hint}</p>
      </div>

      <div
        className={`mt-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 transition-colors ${accentRing[accent]}`}
      >
        <div className="flex justify-center">
          <div className="inline-grid grid-cols-[2.75rem_auto_2.75rem_auto] items-center gap-x-2 gap-y-0">
            <input
              id={`${id}-h`}
              type="number"
              min={0}
              max={23}
              inputMode="numeric"
              className="w-full px-1 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold tabular-nums text-center outline-none"
              value={value.h}
              onChange={e => onChange({ ...value, h: Math.max(0, Number(e.target.value) || 0) })}
              aria-label={t('adjustHours', { field: label })}
            />
            <span className="text-xs font-medium text-slate-500 pr-1">{t('adjustUnitHours')}</span>
            <input
              id={`${id}-m`}
              type="number"
              min={0}
              max={59}
              inputMode="numeric"
              className="w-full px-1 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold tabular-nums text-center outline-none"
              value={value.m}
              onChange={e => onChange({ ...value, m: Math.min(59, Math.max(0, Number(e.target.value) || 0)) })}
              aria-label={t('adjustMinutes', { field: label })}
            />
            <span className="text-xs font-medium text-slate-500">{t('adjustUnitMinutes')}</span>
          </div>
        </div>
        <div className="min-h-[1.375rem] mt-2 flex justify-center">
          {changed ? (
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md whitespace-nowrap">
              {fmtMinutes(originalMinutes)} → {fmtMinutes(currentMinutes)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, valueClass = 'text-slate-800' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg bg-white border border-slate-100 px-3 py-2.5 min-h-[4.25rem] flex flex-col items-center justify-center text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 leading-tight">{label}</p>
      <p className={`text-sm font-semibold tabular-nums mt-1 leading-none ${valueClass}`}>{value}</p>
    </div>
  );
}

export const TimesheetAdjustModal: React.FC<Props> = ({
  day,
  punches,
  employeeName,
  dayStatusLabel,
  fmtMinutes,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation('ptrp');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [worked, setWorked] = useState(() => minutesToParts(day.workedMinutes));
  const [overtime, setOvertime] = useState(() => minutesToParts(day.overtimeMinutes));
  const [late, setLate] = useState(() => minutesToParts(day.lateMinutes));
  const [absence, setAbsence] = useState(() => minutesToParts(day.absenceMinutes));
  const [remarks, setRemarks] = useState(day.remarks || '');

  const slots = useMemo(() => pairPunchesToSlots(punches, day.workDate), [punches, day.workDate]);

  const hasChanges = useMemo(() => (
    partsToMinutes(worked) !== day.workedMinutes ||
    partsToMinutes(overtime) !== day.overtimeMinutes ||
    partsToMinutes(late) !== day.lateMinutes ||
    partsToMinutes(absence) !== day.absenceMinutes ||
    remarks.trim() !== (day.remarks || '').trim()
  ), [worked, overtime, late, absence, remarks, day]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remarks.trim()) {
      setError(t('adjustRemarksRequired'));
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await onSave({
        workedMinutes: partsToMinutes(worked),
        overtimeMinutes: partsToMinutes(overtime),
        lateMinutes: partsToMinutes(late),
        absenceMinutes: partsToMinutes(absence),
        remarks: remarks.trim(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('loadFailed');
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timesheet-adjust-title"
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 motion-reduce:animate-none max-h-[92vh] flex flex-col">
        <div className="p-5 sm:p-6 bg-primary text-white flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <Edit3 size={18} aria-hidden />
              <h2 id="timesheet-adjust-title" className="text-lg font-semibold tracking-tight">
                {t('adjustModalTitle')}
              </h2>
            </div>
            <p className="text-sm text-white/90 font-medium tabular-nums">
              {formatIsoDateBr(day.workDate)} · {employeeName}
            </p>
            <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide bg-white/15 px-2 py-0.5 rounded-md">
              {dayStatusLabel(day.status)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-white/10 p-2 rounded-lg transition-colors shrink-0"
            aria-label={t('common:cancel')}
          >
            <X size={22} />
          </button>
        </div>

        <form id="timesheet-adjust-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-5">
          <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3 flex gap-3 text-sm text-sky-900">
            <Info size={18} className="shrink-0 mt-0.5" aria-hidden />
            <p className="text-xs leading-relaxed">{t('adjustModalIntro')}</p>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex gap-2 text-xs font-medium text-rose-800">
              <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden />
              {error}
            </div>
          )}

          <section className="space-y-3" aria-labelledby="adjust-punches-heading">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-primary shrink-0" aria-hidden />
              <h3 id="adjust-punches-heading" className="text-sm font-semibold text-slate-800">
                {t('adjustSectionPunches')}
              </h3>
            </div>
            <p className="text-xs text-slate-500">{t('adjustSectionPunchesHint')}</p>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="w-1/4 px-3 py-2 font-semibold text-center">{t('colEntry1')}</th>
                    <th className="w-1/4 px-3 py-2 font-semibold text-center">{t('colExit1')}</th>
                    <th className="w-1/4 px-3 py-2 font-semibold text-center">{t('colEntry2')}</th>
                    <th className="w-1/4 px-3 py-2 font-semibold text-center">{t('colExit2')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-2.5 tabular-nums font-medium text-slate-800 text-center">{formatSlotTime(slots.entry1)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-slate-800 text-center">{formatSlotTime(slots.exit1)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-slate-800 text-center">{formatSlotTime(slots.entry2)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-slate-800 text-center">
                      <span className="inline-flex items-center gap-1">
                        {formatSlotTime(slots.exit2)}
                        {slots.overflow.length > 0 && (
                          <span className="text-[10px] font-semibold text-primary bg-primary-light/60 px-1.5 py-0.5 rounded">
                            +{slots.overflow.length}
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {slots.allPunches.length === 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                {t('adjustNoPunchesHint')}
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 space-y-3" aria-labelledby="adjust-current-heading">
            <h3 id="adjust-current-heading" className="text-sm font-semibold text-slate-800">
              {t('adjustSectionCurrent')}
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label={t('expected')} value={fmtMinutes(day.expectedMinutes)} />
              <StatCard label={t('colWorkedShort')} value={fmtMinutes(day.workedMinutes)} />
              <StatCard
                label={t('colOvertimeShort')}
                value={day.overtimeMinutes ? fmtMinutes(day.overtimeMinutes) : '—'}
                valueClass="text-primary"
              />
              <StatCard
                label={t('late')}
                value={day.lateMinutes ? fmtMinutes(day.lateMinutes) : '—'}
                valueClass="text-amber-800"
              />
              <StatCard
                label={t('absence')}
                value={day.absenceMinutes ? fmtMinutes(day.absenceMinutes) : '—'}
                valueClass="text-rose-700"
              />
              <StatCard label={t('status')} value={dayStatusLabel(day.status)} valueClass="text-slate-800" />
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 space-y-4" aria-labelledby="adjust-values-heading">
            <div>
              <h3 id="adjust-values-heading" className="text-sm font-semibold text-slate-800">
                {t('adjustSectionValues')}
              </h3>
              <p className="text-xs text-slate-500 mt-1">{t('adjustSectionValuesHint')}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
              <DurationField
                id="worked"
                label={t('worked')}
                hint={t('adjustWorkedHint')}
                value={worked}
                onChange={setWorked}
                originalMinutes={day.workedMinutes}
                fmtMinutes={fmtMinutes}
              />
              <DurationField
                id="overtime"
                label={t('overtimeFull')}
                hint={t('adjustOvertimeHint')}
                value={overtime}
                onChange={setOvertime}
                originalMinutes={day.overtimeMinutes}
                fmtMinutes={fmtMinutes}
                accent="primary"
              />
              <DurationField
                id="late"
                label={t('late')}
                hint={t('adjustLateHint')}
                value={late}
                onChange={setLate}
                originalMinutes={day.lateMinutes}
                fmtMinutes={fmtMinutes}
                accent="amber"
              />
              <DurationField
                id="absence"
                label={t('absence')}
                hint={t('adjustAbsenceHint')}
                value={absence}
                onChange={setAbsence}
                originalMinutes={day.absenceMinutes}
                fmtMinutes={fmtMinutes}
                accent="rose"
              />
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 space-y-2">
            <label htmlFor="adjust-remarks" className="block text-xs font-semibold text-slate-700">
              {t('adjustRemarksLabel')}
            </label>
            <p className="text-[11px] text-slate-500">{t('adjustRemarksHint')}</p>
            <textarea
              id="adjust-remarks"
              rows={3}
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-primary/15 resize-y min-h-[5rem]"
              placeholder={t('adjustRemarksPlaceholder')}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
            />
          </section>

          {!hasChanges && (
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <Info size={14} aria-hidden />
              {t('adjustNoChangesYet')}
            </p>
          )}
        </form>

        <div className="shrink-0 p-5 sm:p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {t('common:cancel')}
          </button>
          <button
            type="submit"
            form="timesheet-adjust-form"
            disabled={isSaving || !hasChanges}
            className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-semibold hover:opacity-95 disabled:opacity-50"
          >
            {isSaving ? t('adjustSaving') : t('saveAdjust')}
          </button>
        </div>
      </div>
    </div>
  );
};
