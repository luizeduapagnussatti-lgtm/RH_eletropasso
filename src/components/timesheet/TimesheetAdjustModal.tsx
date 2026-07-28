import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Coffee,
  Eye,
  EyeOff,
  Info,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Punch, PunchDirection, TimesheetDay } from '../../types';
import { pairPunchesToSlots, punchLocalDateKey } from '../../services/punch.service';
import { syncAbsenceFromWorked } from '../../utils/timesheetAdjust';
import { formatIsoDateBr, formatTime } from '../../i18n/format';

export interface TimesheetAdjustValues {
  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  absenceMinutes: number;
  remarks: string;
}

export interface TimesheetAddPunchInput {
  time: string; // HH:MM
  direction: PunchDirection;
  remarks?: string;
}

export interface TimesheetUpdatePunchInput {
  punchedAtTime: string; // HH:MM
  direction: PunchDirection;
}

export interface FixedBreakWindow {
  start: string;
  end: string;
}

interface Props {
  day: TimesheetDay;
  punches: Punch[];
  employeeName: string;
  dayStatusLabel: (status: string) => string;
  fmtMinutes: (mins: number) => string;
  canManageAck: boolean;
  canEditHours: boolean;
  fixedBreak?: FixedBreakWindow | null;
  onClose: () => void;
  onSave: (values: TimesheetAdjustValues) => Promise<void>;
  onSetManagerAck: (acked: boolean) => Promise<void>;
  onAddPunch: (input: TimesheetAddPunchInput) => Promise<void>;
  onUpdatePunch: (punchId: string, input: TimesheetUpdatePunchInput) => Promise<void>;
  onDeletePunch: (punchId: string) => Promise<void>;
  onSetPunchIgnoredForCalc: (punchId: string, ignored: boolean) => Promise<void>;
  onApplyFixedBreak: () => Promise<void>;
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

function suggestNextDirection(punches: Punch[]): PunchDirection {
  const sorted = [...punches].sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));
  if (sorted.length === 0) return 'IN';
  const last = sorted[sorted.length - 1]!;
  if (last.direction === 'IN' || last.direction === 'BREAK_END') return 'OUT';
  if (last.direction === 'OUT' || last.direction === 'BREAK_START') return 'IN';
  return sorted.length % 2 === 0 ? 'IN' : 'OUT';
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
  readOnly?: boolean;
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
  readOnly,
  onUseExpected,
  useExpectedLabel,
}: DurationFieldProps) {
  const { t } = useTranslation('ptrp');
  const currentMinutes = partsToMinutes(value);
  const changed = currentMinutes !== originalMinutes;
  const locked = disabled || readOnly;

  const bump = (deltaMin: number) => {
    if (readOnly) return;
    const next = Math.max(0, currentMinutes + deltaMin);
    onChange(minutesToParts(next));
  };

  return (
    <div className={`rounded-xl border border-slate-300 bg-slate-100 p-3.5 space-y-2.5 ${locked ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <label htmlFor={`${id}-h`} className="block text-sm font-bold text-slate-900">
            {label}
          </label>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{hint}</p>
        </div>
        {onUseExpected && useExpectedLabel && !locked && (
          <button
            type="button"
            onClick={onUseExpected}
            className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 hover:bg-primary/15 px-2 py-1 rounded-md"
          >
            {useExpectedLabel}
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          disabled={locked || currentMinutes < 15}
          onClick={() => bump(-15)}
          className="h-9 w-9 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center"
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
            disabled={locked}
            readOnly={readOnly}
            className="w-full px-1 py-2 rounded-lg border border-slate-300 bg-white text-base font-bold tabular-nums text-center text-slate-900 outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-200"
            value={value.h}
            onChange={e => onChange({ ...value, h: Math.max(0, Number(e.target.value) || 0) })}
            aria-label={t('adjustHours', { field: label })}
          />
          <span className="text-xs font-semibold text-slate-600">{t('adjustUnitHours')}</span>
          <input
            id={`${id}-m`}
            type="number"
            min={0}
            max={59}
            inputMode="numeric"
            disabled={locked}
            readOnly={readOnly}
            className="w-full px-1 py-2 rounded-lg border border-slate-300 bg-white text-base font-bold tabular-nums text-center text-slate-900 outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-200"
            value={value.m}
            onChange={e => onChange({ ...value, m: Math.min(59, Math.max(0, Number(e.target.value) || 0)) })}
            aria-label={t('adjustMinutes', { field: label })}
          />
          <span className="text-xs font-semibold text-slate-600">{t('adjustUnitMinutes')}</span>
        </div>

        <button
          type="button"
          disabled={locked}
          onClick={() => bump(15)}
          className="h-9 w-9 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center"
          aria-label={t('adjustPlus15')}
          title={t('adjustPlus15')}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="min-h-[1.25rem] flex justify-center">
        {changed ? (
          <span className="text-[10px] font-bold text-amber-950 bg-amber-100 px-2 py-0.5 rounded-md">
            {fmtMinutes(originalMinutes)} → {fmtMinutes(currentMinutes)}
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-slate-600">{fmtMinutes(currentMinutes)}</span>
        )}
      </div>
    </div>
  );
}

function directionLabel(dir: PunchDirection, t: (k: string) => string): string {
  if (dir === 'IN') return t('punchDirIn');
  if (dir === 'OUT') return t('punchDirOut');
  if (dir === 'BREAK_START') return t('punchDirBreakStart');
  if (dir === 'BREAK_END') return t('punchDirBreakEnd');
  return t('punchDirUnknown');
}

export const TimesheetAdjustModal: React.FC<Props> = ({
  day,
  punches,
  employeeName,
  dayStatusLabel,
  fmtMinutes,
  canManageAck,
  canEditHours,
  fixedBreak,
  onClose,
  onSave,
  onSetManagerAck,
  onAddPunch,
  onUpdatePunch,
  onDeletePunch,
  onSetPunchIgnoredForCalc,
  onApplyFixedBreak,
}) => {
  const { t } = useTranslation('ptrp');
  const [isSaving, setIsSaving] = useState(false);
  const [isAckBusy, setIsAckBusy] = useState(false);
  const [isPunchBusy, setIsPunchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localAck, setLocalAck] = useState(day.managerAck);
  const [showManualTotals, setShowManualTotals] = useState(false);

  const [worked, setWorked] = useState(() => minutesToParts(day.workedMinutes));
  const [overtime, setOvertime] = useState(() => minutesToParts(day.overtimeMinutes));
  const [late, setLate] = useState(() => minutesToParts(day.lateMinutes));
  const [absence, setAbsence] = useState(() =>
    minutesToParts(syncAbsenceFromWorked(day.expectedMinutes, day.workedMinutes)),
  );
  const [remarks, setRemarks] = useState(day.remarks || '');

  const setWorkedAndSyncAbsence = (next: DurationParts) => {
    setWorked(next);
    setAbsence(minutesToParts(syncAbsenceFromWorked(day.expectedMinutes, partsToMinutes(next))));
  };

  const [newPunchTime, setNewPunchTime] = useState('');
  const [newPunchDir, setNewPunchDir] = useState<PunchDirection>(() => suggestNextDirection(punches));
  const [newPunchNote, setNewPunchNote] = useState('');
  const [editingPunchId, setEditingPunchId] = useState<string | null>(null);
  const [editPunchTime, setEditPunchTime] = useState('');
  const [editPunchDir, setEditPunchDir] = useState<PunchDirection>('IN');

  const dayPunches = useMemo(
    () =>
      punches
        .filter(p => punchLocalDateKey(p.punchedAt) === day.workDate)
        .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt)),
    [punches, day.workDate],
  );

  const slots = useMemo(() => pairPunchesToSlots(dayPunches, day.workDate), [dayPunches, day.workDate]);
  const hoursLockedByAck = localAck && canEditHours;
  const punchEditLocked = !canEditHours || localAck;

  useEffect(() => {
    setWorked(minutesToParts(day.workedMinutes));
    setOvertime(minutesToParts(day.overtimeMinutes));
    setLate(minutesToParts(day.lateMinutes));
    setAbsence(minutesToParts(syncAbsenceFromWorked(day.expectedMinutes, day.workedMinutes)));
    setRemarks(day.remarks || '');
    setLocalAck(day.managerAck);
  }, [
    day.id,
    day.workedMinutes,
    day.overtimeMinutes,
    day.lateMinutes,
    day.absenceMinutes,
    day.expectedMinutes,
    day.remarks,
    day.managerAck,
  ]);

  useEffect(() => {
    setNewPunchDir(suggestNextDirection(dayPunches));
  }, [dayPunches]);

  useEffect(() => {
    const last = dayPunches[dayPunches.length - 1];
    if (last && (last.direction === 'IN' || last.direction === 'BREAK_END')) {
      setNewPunchTime(prev => (prev ? prev : '17:45'));
    }
  }, [day.id, dayPunches]);

  const hasChanges = useMemo(() => {
    const syncedAbsence = syncAbsenceFromWorked(day.expectedMinutes, partsToMinutes(worked));
    return (
      partsToMinutes(worked) !== day.workedMinutes ||
      partsToMinutes(overtime) !== day.overtimeMinutes ||
      partsToMinutes(late) !== day.lateMinutes ||
      syncedAbsence !== day.absenceMinutes ||
      remarks.trim() !== (day.remarks || '').trim()
    );
  }, [worked, overtime, late, remarks, day]);

  const handleToggleIgnorePunch = async (punchId: string, ignored: boolean) => {
    if (punchEditLocked) {
      setError(t('adjustNeedUnapproveFirst'));
      return;
    }
    setError(null);
    setIsPunchBusy(true);
    try {
      await onSetPunchIgnoredForCalc(punchId, ignored);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('punchFailed'));
    } finally {
      setIsPunchBusy(false);
    }
  };

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

  const handleAddPunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (punchEditLocked) {
      setError(t('adjustNeedUnapproveFirst'));
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(newPunchTime)) {
      setError(t('adjustPunchTimeInvalid'));
      return;
    }
    setError(null);
    setIsPunchBusy(true);
    try {
      await onAddPunch({
        time: newPunchTime,
        direction: newPunchDir,
        remarks: newPunchNote.trim() || undefined,
      });
      setNewPunchNote('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('punchFailed'));
    } finally {
      setIsPunchBusy(false);
    }
  };

  const handleDeletePunch = async (punchId: string) => {
    if (punchEditLocked) {
      setError(t('adjustNeedUnapproveFirst'));
      return;
    }
    if (!window.confirm(t('adjustDeletePunchConfirm'))) return;
    setError(null);
    setIsPunchBusy(true);
    try {
      await onDeletePunch(punchId);
      if (editingPunchId === punchId) setEditingPunchId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('punchFailed'));
    } finally {
      setIsPunchBusy(false);
    }
  };

  const startEditPunch = (p: Punch) => {
    const d = new Date(p.punchedAt);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    setEditingPunchId(p.id);
    setEditPunchTime(hhmm);
    setEditPunchDir(p.direction);
    setError(null);
  };

  const handleSaveEditPunch = async () => {
    if (!editingPunchId || punchEditLocked) return;
    if (!/^\d{2}:\d{2}$/.test(editPunchTime)) {
      setError(t('adjustPunchTimeInvalid'));
      return;
    }
    setError(null);
    setIsPunchBusy(true);
    try {
      await onUpdatePunch(editingPunchId, {
        punchedAtTime: editPunchTime,
        direction: editPunchDir,
      });
      setEditingPunchId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('punchFailed'));
    } finally {
      setIsPunchBusy(false);
    }
  };

  const handleApplyFixedBreak = async () => {
    if (punchEditLocked) {
      setError(t('adjustNeedUnapproveFirst'));
      return;
    }
    if (!fixedBreak) {
      setError(t('adjustFixedBreakUnavailable'));
      return;
    }
    setError(null);
    setIsPunchBusy(true);
    try {
      await onApplyFixedBreak();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('punchFailed'));
    } finally {
      setIsPunchBusy(false);
    }
  };

  const hasClockBreak = dayPunches.some(
    (p) =>
      (p.direction === 'BREAK_START' || p.direction === 'BREAK_END') && p.source === 'CLOCK',
  );

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
        absenceMinutes: syncAbsenceFromWorked(day.expectedMinutes, partsToMinutes(worked)),
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
    setAbsence(minutesToParts(syncAbsenceFromWorked(day.expectedMinutes, day.workedMinutes)));
    setRemarks(day.remarks || '');
    setError(null);
  };

  const busy = isSaving || isAckBusy || isPunchBusy;

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
            <p className="text-sm text-white/90 font-medium tabular-nums truncate">
              {formatIsoDateBr(day.workDate)} · {employeeName}
            </p>
            <p className="text-[11px] text-slate-300">
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

        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4">
          {/* Approval banner — solid fills so dark mode never washes text out */}
          <section
            className={`rounded-xl border px-3.5 py-3 space-y-2 ${
              localAck
                ? 'border-emerald-600 bg-emerald-50'
                : 'border-amber-600 bg-amber-50'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {localAck ? (
                <CheckCircle2 size={18} className="text-emerald-800 shrink-0 mt-0.5" aria-hidden />
              ) : (
                <AlertCircle size={18} className="text-amber-800 shrink-0 mt-0.5" aria-hidden />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className={`text-sm font-bold ${localAck ? 'text-emerald-950' : 'text-amber-950'}`}>
                  {localAck ? t('adjustAckApprovedTitle') : t('adjustAckPendingTitle')}
                </p>
                <p className={`text-xs leading-relaxed font-medium ${localAck ? 'text-emerald-900' : 'text-amber-900'}`}>
                  {localAck ? t('adjustAckApprovedHint') : t('adjustAckPendingHint')}
                </p>
              </div>
            </div>
            {canManageAck && (
              <div className="flex flex-wrap gap-2 pt-1">
                {localAck ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { void handleAck(false); }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 shadow-sm"
                  >
                    <Undo2 size={14} aria-hidden />
                    {isAckBusy ? t('adjustAckWorking') : t('revokeManagerAck')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || hasChanges}
                    onClick={() => { void handleAck(true); }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 shadow-sm"
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
            <div className="rounded-xl border-2 border-rose-600 bg-rose-50 px-3.5 py-2.5 flex gap-2 text-xs font-semibold text-rose-950">
              <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden />
              {error}
            </div>
          )}

          {/* Step 1 — punches (primary) */}
          <section className="space-y-3" aria-labelledby="adjust-punches-heading">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">1</span>
              <h3 id="adjust-punches-heading" className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Clock size={14} className="text-slate-600" aria-hidden />
                {t('adjustSectionPunches')}
              </h3>
            </div>
            <p className="text-xs text-slate-600 ml-7 leading-relaxed">{t('adjustSectionPunchesHint')}</p>
            <p className="text-[11px] text-slate-500 ml-7 leading-relaxed">{t('adjustIgnorePunchHint')}</p>

            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[
                { label: t('colEntry1'), value: formatSlotTime(slots.entry1) },
                { label: t('colExit1'), value: formatSlotTime(slots.exit1) },
                { label: t('colEntry2'), value: formatSlotTime(slots.entry2) },
                { label: t('colExit2'), value: formatSlotTime(slots.exit2) },
              ].map(slot => (
                <div key={slot.label} className="rounded-lg border border-slate-300 bg-slate-100 px-1.5 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-600">{slot.label}</p>
                  <p className="text-sm font-bold tabular-nums text-slate-900 mt-0.5">{slot.value}</p>
                </div>
              ))}
            </div>

            {dayPunches.length > 0 ? (
              <ul className="rounded-xl border border-slate-300 divide-y divide-slate-200 overflow-hidden bg-slate-100">
                {dayPunches.map(p => (
                  <li
                    key={p.id}
                    className={`px-3 py-2.5 bg-white text-sm space-y-2 ${p.ignoredForCalc ? 'opacity-70' : ''}`}
                  >
                    {editingPunchId === p.id ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-semibold uppercase text-slate-700">{t('adjustPunchTime')}</label>
                          <input
                            type="time"
                            value={editPunchTime}
                            onChange={e => setEditPunchTime(e.target.value)}
                            disabled={busy}
                            className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold tabular-nums text-slate-900"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-semibold uppercase text-slate-700">{t('direction')}</label>
                          <select
                            value={editPunchDir}
                            onChange={e => setEditPunchDir(e.target.value as PunchDirection)}
                            disabled={busy}
                            className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900"
                          >
                            <option value="IN">{t('punchDirIn')}</option>
                            <option value="OUT">{t('punchDirOut')}</option>
                            <option value="BREAK_START">{t('punchDirBreakStart')}</option>
                            <option value="BREAK_END">{t('punchDirBreakEnd')}</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => { void handleSaveEditPunch(); }}
                          className="h-9 px-3 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {t('adjustSavePunchEdit')}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setEditingPunchId(null)}
                          className="h-9 px-3 rounded-lg border border-slate-300 bg-slate-100 text-slate-800 text-xs font-semibold"
                        >
                          {t('adjustCancelPunchEdit')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-bold tabular-nums text-slate-900 w-14 shrink-0 ${p.ignoredForCalc ? 'line-through text-slate-500' : ''}`}>
                          {formatTime(p.punchedAt, { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                        <span className="text-xs font-semibold text-slate-700 w-24 shrink-0">
                          {directionLabel(p.direction, t)}
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          p.source === 'MANUAL'
                            ? 'bg-violet-100 text-violet-900'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {p.source === 'MANUAL' ? t('punchSourceManual') : t('punchSourceClock')}
                        </span>
                        {p.ignoredForCalc && (
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            p.ignoreSource === 'MANUAL'
                              ? 'bg-amber-100 text-amber-950'
                              : 'bg-sky-100 text-sky-950'
                          }`}>
                            {p.ignoreSource === 'MANUAL' ? t('punchIgnoredManual') : t('punchIgnoredAuto')}
                          </span>
                        )}
                        <span className="flex-1" />
                        {canEditHours && !localAck && p.source !== 'MANUAL' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => { void handleToggleIgnorePunch(p.id, !p.ignoredForCalc); }}
                            className="h-8 w-8 rounded-lg text-slate-700 hover:bg-slate-100 flex items-center justify-center disabled:opacity-50"
                            aria-label={p.ignoredForCalc ? t('adjustConsiderPunch') : t('adjustIgnorePunch')}
                            title={p.ignoredForCalc ? t('adjustConsiderPunch') : t('adjustIgnorePunch')}
                          >
                            {p.ignoredForCalc ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                        )}
                        {canEditHours && p.source === 'MANUAL' && !localAck && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => startEditPunch(p)}
                              className="h-8 w-8 rounded-lg text-slate-700 hover:bg-slate-100 flex items-center justify-center disabled:opacity-50"
                              aria-label={t('adjustEditPunch')}
                              title={t('adjustEditPunch')}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => { void handleDeletePunch(p.id); }}
                              className="h-8 w-8 rounded-lg text-rose-700 hover:bg-rose-50 flex items-center justify-center disabled:opacity-50"
                              aria-label={t('adjustDeletePunch')}
                              title={t('adjustDeletePunch')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs font-semibold text-amber-950 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2.5">
                {t('adjustNoPunchesHint')}
              </p>
            )}

            {canEditHours && fixedBreak && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Coffee size={16} className="text-emerald-800 shrink-0 mt-0.5" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-emerald-950">{t('adjustApplyFixedBreak')}</p>
                    <p className="text-[11px] text-emerald-900 leading-snug mt-0.5">
                      {t('adjustApplyFixedBreakHint', { start: fixedBreak.start, end: fixedBreak.end })}
                    </p>
                    {hasClockBreak && (
                      <p className="text-[11px] font-semibold text-amber-950 mt-1">
                        {t('adjustApplyFixedBreakBlockedClock')}
                      </p>
                    )}
                    {punchEditLocked && (
                      <p className="text-[11px] font-semibold text-sky-950 mt-1">
                        {t('adjustNeedUnapproveFirst')}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={punchEditLocked || busy || hasClockBreak}
                  onClick={() => { void handleApplyFixedBreak(); }}
                  className="h-9 px-3 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Coffee size={14} aria-hidden />
                  {isPunchBusy ? t('adjustPunchWorking') : t('adjustApplyFixedBreak')}
                </button>
              </div>
            )}

            {canEditHours && (
              <form
                onSubmit={handleAddPunch}
                className="rounded-xl border border-slate-300 bg-slate-100 p-3 space-y-2"
              >
                <p className="text-xs font-bold text-slate-900">{t('adjustAddPunchTitle')}</p>
                <p className="text-[11px] text-slate-700 leading-snug">{t('adjustAddPunchHint')}</p>
                {hoursLockedByAck && (
                  <p className="text-[11px] font-semibold text-sky-950 bg-sky-50 border border-sky-300 rounded-lg px-2.5 py-1.5 flex gap-1.5">
                    <Info size={14} className="shrink-0 mt-0.5" aria-hidden />
                    {t('adjustNeedUnapproveFirst')}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="space-y-1">
                    <label htmlFor="new-punch-time" className="block text-[10px] font-bold uppercase text-slate-700">
                      {t('adjustPunchTime')}
                    </label>
                    <input
                      id="new-punch-time"
                      type="time"
                      required
                      disabled={punchEditLocked || busy}
                      value={newPunchTime}
                      onChange={e => setNewPunchTime(e.target.value)}
                      className="h-10 px-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold tabular-nums text-slate-900 disabled:bg-slate-200 disabled:text-slate-600"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="new-punch-dir" className="block text-[10px] font-bold uppercase text-slate-700">
                      {t('direction')}
                    </label>
                    <select
                      id="new-punch-dir"
                      disabled={punchEditLocked || busy}
                      value={newPunchDir}
                      onChange={e => setNewPunchDir(e.target.value as PunchDirection)}
                      className="h-10 px-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 disabled:bg-slate-200 disabled:text-slate-600"
                    >
                      <option value="IN">{t('punchDirIn')}</option>
                      <option value="OUT">{t('punchDirOut')}</option>
                      <option value="BREAK_START">{t('punchDirBreakStart')}</option>
                      <option value="BREAK_END">{t('punchDirBreakEnd')}</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={punchEditLocked || busy}
                    className="h-10 px-3 rounded-lg bg-primary text-white text-xs font-semibold hover:opacity-95 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed inline-flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus size={14} aria-hidden />
                    {isPunchBusy ? t('adjustPunchWorking') : t('adjustAddPunch')}
                  </button>
                </div>
                <input
                  type="text"
                  disabled={punchEditLocked || busy}
                  value={newPunchNote}
                  onChange={e => setNewPunchNote(e.target.value)}
                  placeholder={t('adjustPunchNotePlaceholder')}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 disabled:bg-slate-200 disabled:text-slate-600"
                />
              </form>
            )}
          </section>

          {/* Step 2 — calculated totals (read-only summary) */}
          <section className="space-y-2" aria-labelledby="adjust-calc-heading">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">2</span>
              <h3 id="adjust-calc-heading" className="text-sm font-semibold text-slate-900">
                {t('adjustSectionCalculated')}
              </h3>
            </div>
            <p className="text-xs text-slate-600 ml-7">{t('adjustSectionCalculatedHint')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { label: t('worked'), value: fmtMinutes(day.workedMinutes) },
                { label: t('colBreak'), value: day.breakMinutes ? fmtMinutes(day.breakMinutes) : '—' },
                { label: t('overtimeFull'), value: day.overtimeMinutes ? fmtMinutes(day.overtimeMinutes) : '—' },
                { label: t('late'), value: day.lateMinutes ? fmtMinutes(day.lateMinutes) : '—' },
                { label: t('absence'), value: day.absenceMinutes ? fmtMinutes(day.absenceMinutes) : '—' },
              ].map(card => (
                <div key={card.label} className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-2.5 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-600">{card.label}</p>
                  <p className="text-sm font-bold tabular-nums text-slate-900 mt-0.5">{card.value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Advanced: manual totals override */}
          {canEditHours && (
            <details
              className="rounded-xl border border-slate-200 bg-slate-50 open:bg-white"
              open={showManualTotals}
              onToggle={e => setShowManualTotals((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer select-none px-3.5 py-2.5 text-xs font-bold text-slate-800 list-none flex items-center justify-between gap-2">
                <span>{t('adjustManualTotalsToggle')}</span>
                <span className="text-[10px] font-semibold uppercase text-slate-500">
                  {showManualTotals ? t('adjustManualTotalsHide') : t('adjustManualTotalsShow')}
                </span>
              </summary>
              <form id="timesheet-adjust-form" onSubmit={handleSubmit} className="px-3.5 pb-3.5 space-y-3 border-t border-slate-100 pt-3">
                <p className="text-[11px] text-slate-600 leading-relaxed">{t('adjustSectionValuesHint')}</p>
                {hoursLockedByAck && (
                  <p className="text-[11px] font-semibold text-sky-950 bg-sky-50 border border-sky-300 rounded-lg px-2.5 py-1.5">
                    {t('adjustNeedUnapproveFirst')}
                  </p>
                )}
                {hasChanges && !localAck && (
                  <button
                    type="button"
                    onClick={resetToOriginal}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 hover:text-slate-900"
                  >
                    <RotateCcw size={12} aria-hidden />
                    {t('adjustReset')}
                  </button>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DurationField
                    id="worked"
                    label={t('worked')}
                    hint={t('adjustWorkedHint')}
                    value={worked}
                    onChange={setWorkedAndSyncAbsence}
                    originalMinutes={day.workedMinutes}
                    fmtMinutes={fmtMinutes}
                    disabled={!canEditHours || localAck}
                    onUseExpected={
                      day.expectedMinutes > 0
                        ? () => setWorkedAndSyncAbsence(minutesToParts(day.expectedMinutes))
                        : undefined
                    }
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
                    hint={t('adjustAbsenceSyncedHint')}
                    value={absence}
                    onChange={setAbsence}
                    originalMinutes={day.absenceMinutes}
                    fmtMinutes={fmtMinutes}
                    disabled={!canEditHours || localAck}
                    readOnly
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="adjust-remarks" className="block text-xs font-bold text-slate-900">
                    {t('adjustRemarksLabel')}
                  </label>
                  <textarea
                    id="adjust-remarks"
                    rows={2}
                    required={hasChanges}
                    disabled={localAck}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary/20 resize-y min-h-[4rem] disabled:bg-slate-50 disabled:opacity-70"
                    placeholder={t('adjustRemarksPlaceholder')}
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                  />
                </div>
              </form>
            </details>
          )}
        </div>

        <div className="shrink-0 p-4 sm:p-5 border-t border-slate-200 bg-slate-100 flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-3 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 shadow-sm"
          >
            {t('common:close')}
          </button>
          {canEditHours && showManualTotals && (
            <button
              type="submit"
              form="timesheet-adjust-form"
              disabled={busy || !hasChanges || localAck}
              className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-bold hover:opacity-95 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed shadow-sm"
            >
              {isSaving ? t('adjustSaving') : t('saveAdjust')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
