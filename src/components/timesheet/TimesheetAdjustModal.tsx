import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  Minus,
  Plus,
  RotateCcw,
  Undo2,
  X,
} from 'lucide-react';
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
  canManageAck: boolean;
  canEditHours: boolean;
  onClose: () => void;
  onSave: (values: TimesheetAdjustValues) => Promise<void>;
  onSetManagerAck: (acked: boolean) => Promise<void>;
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
  disabled?: boolean;
  onUseExpected?: () => void;
  useExpectedLabel?: string;
}

function DurationField({
  id,
  label,
  hint,
  value,
  onChange,
  originalMinutes,
  fmtMinutes,
  disabled,
  onUseExpected,
  useExpectedLabel,
}: DurationFieldProps) {
  const { t } = useTranslation('ptrp');
  const currentMinutes = partsToMinutes(value);
  const changed = currentMinutes !== originalMinutes;

  const bump = (deltaMin: number) => {
    const next = Math.max(0, currentMinutes + deltaMin);
    onChange(minutesToParts(next));
  };

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <label htmlFor={`${id}-h`} className="block text-sm font-semibold text-slate-800">
            {label}
          </label>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{hint}</p>
        </div>
        {onUseExpected && useExpectedLabel && !disabled && (
          <button
            type="button"
            onClick={onUseExpected}
            className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 hover:bg-primary/15 px-2 py-1 rounded-md"
          >
            {useExpectedLabel}
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          disabled={disabled || currentMinutes < 15}
          onClick={() => bump(-15)}
          className="h-9 w-9 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center"
          aria-label={t('adjustMinus15')}
          title={t('adjustMinus15')}
        >
          <Minus size={16} />
        </button>

        <div className="inline-grid grid-cols-[3rem_auto_3rem_auto] items-center gap-x-1.5">
          <input
            id={`${id}-h`}
            type="number"
            min={0}
            max={23}
            inputMode="numeric"
            disabled={disabled}
            className="w-full px-1 py-2 rounded-lg border border-slate-200 bg-white text-base font-semibold tabular-nums text-center outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50"
            value={value.h}
            onChange={e => onChange({ ...value, h: Math.max(0, Number(e.target.value) || 0) })}
            aria-label={t('adjustHours', { field: label })}
          />
          <span className="text-xs font-medium text-slate-500">{t('adjustUnitHours')}</span>
          <input
            id={`${id}-m`}
            type="number"
            min={0}
            max={59}
            inputMode="numeric"
            disabled={disabled}
            className="w-full px-1 py-2 rounded-lg border border-slate-200 bg-white text-base font-semibold tabular-nums text-center outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50"
            value={value.m}
            onChange={e => onChange({ ...value, m: Math.min(59, Math.max(0, Number(e.target.value) || 0)) })}
            aria-label={t('adjustMinutes', { field: label })}
          />
          <span className="text-xs font-medium text-slate-500">{t('adjustUnitMinutes')}</span>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => bump(15)}
          className="h-9 w-9 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center"
          aria-label={t('adjustPlus15')}
          title={t('adjustPlus15')}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="min-h-[1.25rem] flex justify-center">
        {changed ? (
          <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md">
            {fmtMinutes(originalMinutes)} → {fmtMinutes(currentMinutes)}
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">{fmtMinutes(currentMinutes)}</span>
        )}
      </div>
    </div>
  );
}

export const TimesheetAdjustModal: React.FC<Props> = ({
  day,
  punches,
  employeeName,
  dayStatusLabel,
  fmtMinutes,
  canManageAck,
  canEditHours,
  onClose,
  onSave,
  onSetManagerAck,
}) => {
  const { t } = useTranslation('ptrp');
  const [isSaving, setIsSaving] = useState(false);
  const [isAckBusy, setIsAckBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localAck, setLocalAck] = useState(day.managerAck);

  const [worked, setWorked] = useState(() => minutesToParts(day.workedMinutes));
  const [overtime, setOvertime] = useState(() => minutesToParts(day.overtimeMinutes));
  const [late, setLate] = useState(() => minutesToParts(day.lateMinutes));
  const [absence, setAbsence] = useState(() => minutesToParts(day.absenceMinutes));
  const [remarks, setRemarks] = useState(day.remarks || '');

  const slots = useMemo(() => pairPunchesToSlots(punches, day.workDate), [punches, day.workDate]);
  const hoursLockedByAck = localAck && canEditHours;

  const hasChanges = useMemo(() => (
    partsToMinutes(worked) !== day.workedMinutes ||
    partsToMinutes(overtime) !== day.overtimeMinutes ||
    partsToMinutes(late) !== day.lateMinutes ||
    partsToMinutes(absence) !== day.absenceMinutes ||
    remarks.trim() !== (day.remarks || '').trim()
  ), [worked, overtime, late, absence, remarks, day]);

  const handleAck = async (acked: boolean) => {
    setError(null);
    setIsAckBusy(true);
    try {
      await onSetManagerAck(acked);
      setLocalAck(acked);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setIsAckBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditHours) return;
    if (localAck) {
      setError(t('adjustNeedUnapproveFirst'));
      return;
    }
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

  const resetToOriginal = () => {
    setWorked(minutesToParts(day.workedMinutes));
    setOvertime(minutesToParts(day.overtimeMinutes));
    setLate(minutesToParts(day.lateMinutes));
    setAbsence(minutesToParts(day.absenceMinutes));
    setRemarks(day.remarks || '');
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timesheet-adjust-title"
    >
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 motion-reduce:animate-none max-h-[94vh] flex flex-col">
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex justify-between items-start gap-3 shrink-0">
          <div className="min-w-0 space-y-1">
            <h2 id="timesheet-adjust-title" className="text-lg font-semibold tracking-tight">
              {t('adjustModalTitle')}
            </h2>
            <p className="text-sm text-white/85 font-medium tabular-nums truncate">
              {formatIsoDateBr(day.workDate)} · {employeeName}
            </p>
            <p className="text-[11px] text-white/70">
              {t('adjustModalSubtitle', { status: dayStatusLabel(day.status), expected: fmtMinutes(day.expectedMinutes) })}
            </p>
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

        <form id="timesheet-adjust-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4">
          {/* Step 1 — approval */}
          <section
            className={`rounded-xl border px-3.5 py-3 space-y-2 ${
              localAck ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {localAck ? (
                <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" aria-hidden />
              ) : (
                <AlertCircle size={18} className="text-amber-700 shrink-0 mt-0.5" aria-hidden />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-slate-800">
                  {localAck ? t('adjustAckApprovedTitle') : t('adjustAckPendingTitle')}
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {localAck ? t('adjustAckApprovedHint') : t('adjustAckPendingHint')}
                </p>
              </div>
            </div>
            {canManageAck && (
              <div className="flex flex-wrap gap-2 pt-1">
                {localAck ? (
                  <button
                    type="button"
                    disabled={isAckBusy || isSaving}
                    onClick={() => { void handleAck(false); }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-50 disabled:opacity-60"
                  >
                    <Undo2 size={14} aria-hidden />
                    {isAckBusy ? t('adjustAckWorking') : t('revokeManagerAck')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isAckBusy || isSaving || hasChanges}
                    onClick={() => { void handleAck(true); }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                    title={hasChanges ? t('adjustSaveBeforeApprove') : undefined}
                  >
                    <CheckCircle2 size={14} aria-hidden />
                    {isAckBusy ? t('adjustAckWorking') : t('managerAck')}
                  </button>
                )}
              </div>
            )}
          </section>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 flex gap-2 text-xs font-medium text-rose-800">
              <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden />
              {error}
            </div>
          )}

          {/* Step 2 — punches reference */}
          <section className="space-y-2" aria-labelledby="adjust-punches-heading">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">1</span>
              <h3 id="adjust-punches-heading" className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <Clock size={14} className="text-slate-500" aria-hidden />
                {t('adjustSectionPunches')}
              </h3>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[
                { label: t('colEntry1'), value: formatSlotTime(slots.entry1) },
                { label: t('colExit1'), value: formatSlotTime(slots.exit1) },
                { label: t('colEntry2'), value: formatSlotTime(slots.entry2) },
                { label: t('colExit2'), value: formatSlotTime(slots.exit2) },
              ].map(slot => (
                <div key={slot.label} className="rounded-lg border border-slate-100 bg-slate-50 px-1.5 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{slot.label}</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-800 mt-0.5">{slot.value}</p>
                </div>
              ))}
            </div>
            {slots.allPunches.length === 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                {t('adjustNoPunchesHint')}
              </p>
            )}
          </section>

          {/* Step 3 — edit hours */}
          <section className="space-y-3" aria-labelledby="adjust-values-heading">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">2</span>
                  <h3 id="adjust-values-heading" className="text-sm font-semibold text-slate-800">
                    {t('adjustSectionValues')}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1 ml-7">{t('adjustSectionValuesHint')}</p>
              </div>
              {canEditHours && hasChanges && !localAck && (
                <button
                  type="button"
                  onClick={resetToOriginal}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 hover:text-slate-900"
                >
                  <RotateCcw size={12} aria-hidden />
                  {t('adjustReset')}
                </button>
              )}
            </div>

            {hoursLockedByAck && (
              <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 flex gap-2 text-xs text-sky-900">
                <Info size={14} className="shrink-0 mt-0.5" aria-hidden />
                <p>{t('adjustNeedUnapproveFirst')}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DurationField
                id="worked"
                label={t('worked')}
                hint={t('adjustWorkedHint')}
                value={worked}
                onChange={setWorked}
                originalMinutes={day.workedMinutes}
                fmtMinutes={fmtMinutes}
                disabled={!canEditHours || localAck}
                onUseExpected={day.expectedMinutes > 0 ? () => setWorked(minutesToParts(day.expectedMinutes)) : undefined}
                useExpectedLabel={t('adjustUseExpected')}
              />
              <DurationField
                id="overtime"
                label={t('overtimeFull')}
                hint={t('adjustOvertimeHint')}
                value={overtime}
                onChange={setOvertime}
                originalMinutes={day.overtimeMinutes}
                fmtMinutes={fmtMinutes}
                disabled={!canEditHours || localAck}
              />
              <DurationField
                id="late"
                label={t('late')}
                hint={t('adjustLateHint')}
                value={late}
                onChange={setLate}
                originalMinutes={day.lateMinutes}
                fmtMinutes={fmtMinutes}
                disabled={!canEditHours || localAck}
              />
              <DurationField
                id="absence"
                label={t('absence')}
                hint={t('adjustAbsenceHint')}
                value={absence}
                onChange={setAbsence}
                originalMinutes={day.absenceMinutes}
                fmtMinutes={fmtMinutes}
                disabled={!canEditHours || localAck}
              />
            </div>
          </section>

          {/* Step 4 — remarks */}
          {canEditHours && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">3</span>
                <label htmlFor="adjust-remarks" className="text-sm font-semibold text-slate-800">
                  {t('adjustRemarksLabel')}
                </label>
              </div>
              <textarea
                id="adjust-remarks"
                rows={2}
                required={hasChanges}
                disabled={localAck}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-y min-h-[4rem] disabled:bg-slate-50 disabled:opacity-70"
                placeholder={t('adjustRemarksPlaceholder')}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
              />
            </section>
          )}
        </form>

        <div className="shrink-0 p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || isAckBusy}
            className="flex-1 py-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {t('common:close')}
          </button>
          {canEditHours && (
            <button
              type="submit"
              form="timesheet-adjust-form"
              disabled={isSaving || isAckBusy || !hasChanges || localAck}
              className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-semibold hover:opacity-95 disabled:opacity-50"
            >
              {isSaving ? t('adjustSaving') : t('saveAdjust')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
