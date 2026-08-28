import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coffee,
  Eye,
  EyeOff,
  Info,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Punch, PunchDirection, Shift, TimesheetDay } from '../../types';
import { appPunchSelfiePath, pairPunchesToSlots, punchLocalDateKey } from '../../services/punch.service';
import { hrService } from '../../services/hrService';
import { calculateDay } from '../../services/timeCalculation.service';
import { checkDayCoherence, type DayCoherenceContext } from '../../utils/timesheetDayCoherence';
import { dayAckBlockI18nKey, isDayApprovable } from '../../utils/timesheetDayAckValidation';
import { formatIsoDateBr, formatTime } from '../../i18n/format';

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

export interface DayCalcContextProps {
  shift: Shift | null;
  isHoliday: boolean;
  onApprovedLeave: boolean;
  leaveRequestId?: string;
  rosterStatus?: 'WORK' | 'OFF' | null;
  joiningDate?: string;
  terminationDate?: string;
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
  dayCalcContext: DayCalcContextProps;
  onClose: () => void;
  onSaveJustification: (remarks: string) => Promise<void>;
  onSetManagerAck: (acked: boolean) => Promise<void>;
  onAddPunch: (input: TimesheetAddPunchInput) => Promise<void>;
  onUpdatePunch: (punchId: string, input: TimesheetUpdatePunchInput) => Promise<void>;
  onDeletePunch: (punchId: string) => Promise<void>;
  onSetPunchIgnoredForCalc: (punchId: string, ignored: boolean) => Promise<void>;
  onApplyFixedBreak: () => Promise<void>;
  onEndContract?: () => void;
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

function directionLabel(dir: PunchDirection, t: (k: string) => string): string {
  if (dir === 'IN') return t('punchDirIn');
  if (dir === 'OUT') return t('punchDirOut');
  if (dir === 'BREAK_START') return t('punchDirBreakStart');
  if (dir === 'BREAK_END') return t('punchDirBreakEnd');
  return t('punchDirUnknown');
}

function toCoherenceContext(props: DayCalcContextProps): DayCoherenceContext {
  return {
    shift: props.shift,
    isHoliday: props.isHoliday,
    onApprovedLeave: props.onApprovedLeave,
    leaveRequestId: props.leaveRequestId,
    rosterStatus: props.rosterStatus ?? null,
    joiningDate: props.joiningDate,
    terminationDate: props.terminationDate,
  };
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
  dayCalcContext,
  onClose,
  onSaveJustification,
  onSetManagerAck,
  onAddPunch,
  onUpdatePunch,
  onDeletePunch,
  onSetPunchIgnoredForCalc,
  onApplyFixedBreak,
  onEndContract,
}) => {
  const { t } = useTranslation('ptrp');
  const [isSaving, setIsSaving] = useState(false);
  const [isAckBusy, setIsAckBusy] = useState(false);
  const [isPunchBusy, setIsPunchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localAck, setLocalAck] = useState(day.managerAck);
  const [remarks, setRemarks] = useState(day.remarks || '');

  const [newPunchTime, setNewPunchTime] = useState('');
  const [newPunchDir, setNewPunchDir] = useState<PunchDirection>(() => suggestNextDirection(punches));
  const [newPunchNote, setNewPunchNote] = useState('');
  const [showAbsentPunchEditor, setShowAbsentPunchEditor] = useState(false);
  const [editingPunchId, setEditingPunchId] = useState<string | null>(null);
  const [editPunchTime, setEditPunchTime] = useState('');
  const [editPunchDir, setEditPunchDir] = useState<PunchDirection>('IN');
  /** Signed selfie URLs for APP punches (punchId → url | null when missing). */
  const [appSelfieUrls, setAppSelfieUrls] = useState<Record<string, string | null>>({});
  const [selfieViewerPunchId, setSelfieViewerPunchId] = useState<string | null>(null);

  const coherenceCtx = useMemo(() => toCoherenceContext(dayCalcContext), [dayCalcContext]);

  const dayPunches = useMemo(
    () =>
      punches
        .filter(p => punchLocalDateKey(p.punchedAt) === day.workDate)
        .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt)),
    [punches, day.workDate],
  );

  useEffect(() => {
    let active = true;
    const appWithPath = dayPunches.filter(p => p.source === 'APP' && appPunchSelfiePath(p));
    if (appWithPath.length === 0) {
      setAppSelfieUrls({});
      return;
    }
    void (async () => {
      const entries = await Promise.all(
        appWithPath.map(async p => {
          const path = appPunchSelfiePath(p)!;
          const url = await hrService.getAppPunchSelfieUrl(path);
          return [p.id, url] as const;
        }),
      );
      if (!active) return;
      setAppSelfieUrls(Object.fromEntries(entries));
    })();
    return () => {
      active = false;
    };
  }, [dayPunches]);

  const selfieViewerPunch = useMemo(
    () => (selfieViewerPunchId ? dayPunches.find(p => p.id === selfieViewerPunchId) ?? null : null),
    [dayPunches, selfieViewerPunchId],
  );

  const slots = useMemo(() => pairPunchesToSlots(dayPunches, day.workDate), [dayPunches, day.workDate]);

  const liveCalc = useMemo(
    () => calculateDay({
      date: day.workDate,
      punches: dayPunches,
      shift: dayCalcContext.shift,
      isHoliday: dayCalcContext.isHoliday,
      onApprovedLeave: dayCalcContext.onApprovedLeave,
      leaveRequestId: dayCalcContext.leaveRequestId,
      rosterStatus: dayCalcContext.rosterStatus ?? null,
      joiningDate: dayCalcContext.joiningDate,
      terminationDate: dayCalcContext.terminationDate,
    }),
    [day.workDate, dayPunches, dayCalcContext],
  );

  const storedCoherence = useMemo(
    () => checkDayCoherence(day, dayPunches, coherenceCtx),
    [day, dayPunches, coherenceCtx],
  );

  const hasManualPunch = dayPunches.some(p => p.source === 'MANUAL');

  const punchEditLocked = !canEditHours || localAck;
  const dayAckValidation = useMemo(
    () => isDayApprovable(day, dayPunches, coherenceCtx),
    [day, dayPunches, coherenceCtx],
  );

  useEffect(() => {
    setRemarks(day.remarks || '');
    setLocalAck(day.managerAck);
  }, [day.id, day.remarks, day.managerAck]);

  useEffect(() => {
    setNewPunchDir(suggestNextDirection(dayPunches));
  }, [dayPunches]);

  useEffect(() => {
    const last = dayPunches[dayPunches.length - 1];
    if (last && (last.direction === 'IN' || last.direction === 'BREAK_END')) {
      setNewPunchTime(prev => (prev ? prev : '17:45'));
    }
  }, [day.id, dayPunches]);

  const remarksChanged = remarks.trim() !== (day.remarks || '').trim();
  const restDay = new Set(['OFF', 'HOLIDAY', 'LEAVE']);
  const noPunches = dayPunches.length === 0;
  const isAbsentDay =
    day.status === 'ABSENT' ||
    liveCalc.status === 'ABSENT' ||
    (noPunches &&
      (liveCalc.expectedMinutes || day.expectedMinutes || 0) > 0 &&
      !restDay.has(day.status) &&
      !restDay.has(liveCalc.status));
  const showPunchTools = !isAbsentDay || !noPunches || showAbsentPunchEditor;

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

  const handleSaveJustification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditHours || localAck) return;
    if (!remarks.trim()) {
      setError(t('adjustRemarksRequired'));
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await onSaveJustification(remarks.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndApproveAbsence = async () => {
    if (!canEditHours || !canManageAck || localAck) return;
    if (!remarks.trim()) {
      setError(t('adjustRemarksRequired'));
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      if (remarksChanged) {
        await onSaveJustification(remarks.trim());
      }
      await onSetManagerAck(true);
      setLocalAck(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setIsSaving(false);
    }
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
              {t('adjustModalSubtitle', {
                status: dayStatusLabel(storedCoherence.coherent ? liveCalc.status : day.status),
                expected: fmtMinutes(liveCalc.expectedMinutes),
              })}
              {hasManualPunch ? ` · ${t('adjustHasManualPunchBadge')}` : ''}
            </p>
            {isAbsentDay ? (
              <p className="text-[11px] text-rose-200 font-medium leading-snug">
                {t('adjustAbsentJustifyHint')}
              </p>
            ) : null}
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
          {error && (
            <div className="rounded-xl border-2 border-rose-600 bg-rose-50 px-3.5 py-2.5 flex gap-2 text-xs font-semibold text-rose-950">
              <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden />
              {error}
            </div>
          )}

          <form
            id="timesheet-adjust-remarks-form"
            onSubmit={handleSaveJustification}
            className={`space-y-2 rounded-xl border-2 px-3.5 py-3 ${
              isAbsentDay ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">1</span>
              <label htmlFor="adjust-remarks" className="block text-sm font-bold text-slate-900">
                {isAbsentDay ? t('adjustRemarksAbsentLabel') : t('adjustRemarksLabel')}
              </label>
            </div>
            <p className="text-[11px] text-slate-700 leading-relaxed ml-7">
              {isAbsentDay ? t('adjustRemarksAbsentHint') : t('adjustRemarksOptionalHint')}
            </p>
            {isAbsentDay && canEditHours && !localAck ? (
              <div className="flex flex-wrap gap-1.5 ml-7">
                {(['adjustAbsenceChipNoShow', 'adjustAbsenceChipSickNote', 'adjustAbsenceChipDidNotAttend'] as const).map(key => (
                  <button
                    key={key}
                    type="button"
                    disabled={busy}
                    onClick={() => setRemarks(t(key))}
                    className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold border ${
                      remarks.trim() === t(key)
                        ? 'bg-rose-700 text-white border-rose-800'
                        : 'bg-white text-rose-950 border-rose-300 hover:bg-rose-100'
                    }`}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            ) : null}
            <textarea
              id="adjust-remarks"
              rows={3}
              disabled={!canEditHours || localAck}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary/20 resize-y min-h-[4.5rem] disabled:bg-slate-50 disabled:opacity-70"
              placeholder={isAbsentDay ? t('adjustRemarksAbsentPlaceholder') : t('adjustRemarksPlaceholder')}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
            />
            {canEditHours && !localAck ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={busy || !remarks.trim() || !remarksChanged}
                  className="h-10 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed"
                >
                  {isSaving ? t('adjustSaving') : t('saveJustification')}
                </button>
                {isAbsentDay && canManageAck ? (
                  <button
                    type="button"
                    disabled={busy || !remarks.trim() || !storedCoherence.coherent}
                    onClick={() => { void handleSaveAndApproveAbsence(); }}
                    className="h-10 px-3 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 size={14} aria-hidden />
                    {isSaving ? t('adjustAckWorking') : t('adjustSaveAndApproveAbsence')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>

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
                  {localAck
                    ? t('adjustAckApprovedHint')
                    : isAbsentDay
                      ? t('adjustAckPendingAbsentHint')
                      : t('adjustAckPendingHint')}
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
                    disabled={busy || remarksChanged || !dayAckValidation.ok || !storedCoherence.coherent}
                    onClick={() => { void handleAck(true); }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 shadow-sm"
                    title={
                      remarksChanged
                        ? t('adjustSaveBeforeApprove')
                        : !storedCoherence.coherent
                          ? t('ackBlockedIncoherentTotals')
                          : !dayAckValidation.ok
                            ? t(dayAckBlockI18nKey(dayAckValidation.reason || 'unknown'))
                            : undefined
                    }
                  >
                    <CheckCircle2 size={14} aria-hidden />
                    {isAckBusy ? t('adjustAckWorking') : t('managerAck')}
                  </button>
                )}
              </div>
            )}
          </section>

          {!storedCoherence.coherent && (
            <div className="rounded-xl border border-amber-500 bg-amber-50 px-3.5 py-2.5 flex gap-2 text-xs text-amber-950">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden />
              <div>
                <p className="font-bold">{t('adjustIncoherentStoredTitle')}</p>
                <p className="mt-0.5 leading-relaxed">{t('adjustIncoherentStoredHint')}</p>
              </div>
            </div>
          )}

          <section className="space-y-3" aria-labelledby="adjust-punches-heading">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">2</span>
              <h3 id="adjust-punches-heading" className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Clock size={14} className="text-slate-600" aria-hidden />
                {isAbsentDay ? t('adjustWorkedAnyway') : t('adjustSectionPunches')}
              </h3>
            </div>
            <p className="text-xs text-slate-600 ml-7 leading-relaxed">
              {isAbsentDay ? t('adjustWorkedAnywayHint') : t('adjustSectionPunchesHint')}
            </p>
            {!isAbsentDay && (
              <p className="text-[11px] text-slate-500 ml-7 leading-relaxed">{t('adjustIgnorePunchHint')}</p>
            )}

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
                            : p.source === 'APP'
                              ? 'bg-sky-100 text-sky-900'
                              : 'bg-slate-200 text-slate-700'
                        }`}>
                          {p.source === 'MANUAL'
                            ? t('punchSourceManual')
                            : p.source === 'APP'
                              ? t('punchSourceApp')
                              : t('punchSourceClock')}
                        </span>
                        {p.source === 'APP' && appPunchSelfiePath(p) ? (
                          <button
                            type="button"
                            onClick={() => setSelfieViewerPunchId(p.id)}
                            className="shrink-0 rounded-md overflow-hidden border border-sky-200 bg-sky-50 h-10 w-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                            aria-label={t('appPunchSelfie')}
                            title={t('appPunchSelfie')}
                          >
                            {appSelfieUrls[p.id] ? (
                              <img
                                src={appSelfieUrls[p.id]!}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[9px] font-semibold text-sky-800 px-0.5 leading-tight text-center">
                                {Object.prototype.hasOwnProperty.call(appSelfieUrls, p.id)
                                  ? t('appPunchSelfieMissing')
                                  : '…'}
                              </span>
                            )}
                          </button>
                        ) : null}
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
              <p className={`text-xs font-semibold rounded-lg px-3 py-2.5 border ${
                isAbsentDay
                  ? 'text-slate-800 bg-slate-100 border-slate-300'
                  : 'text-amber-950 bg-amber-100 border-amber-300'
              }`}>
                {isAbsentDay ? t('adjustNoPunchesAbsentHint') : t('adjustNoPunchesHint')}
              </p>
            )}

            {isAbsentDay && noPunches && !showAbsentPunchEditor && canEditHours && !localAck ? (
              <button
                type="button"
                onClick={() => setShowAbsentPunchEditor(true)}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <Plus size={14} aria-hidden />
                {t('adjustWorkedAnywayOpen')}
              </button>
            ) : null}

            {showPunchTools && canEditHours && fixedBreak && (
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

            {showPunchTools && canEditHours && (
              <form
                onSubmit={handleAddPunch}
                className="rounded-xl border border-slate-300 bg-slate-100 p-3 space-y-2"
              >
                <p className="text-xs font-bold text-slate-900">{t('adjustAddPunchTitle')}</p>
                <p className="text-[11px] text-slate-700 leading-snug">{t('adjustAddPunchHint')}</p>
                {punchEditLocked && (
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
                  placeholder={isAbsentDay ? t('adjustPunchNotePlaceholderAbsent') : t('adjustPunchNotePlaceholder')}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 disabled:bg-slate-200 disabled:text-slate-600"
                />
              </form>
            )}
          </section>

          <section className="space-y-2" aria-labelledby="adjust-calc-heading">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">3</span>
              <h3 id="adjust-calc-heading" className="text-sm font-semibold text-slate-900">
                {t('adjustSectionCalculated')}
              </h3>
            </div>
            <p className="text-xs text-slate-600 ml-7">{t('adjustSectionCalculatedReadOnlyHint')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { label: t('worked'), value: fmtMinutes(liveCalc.workedMinutes) },
                { label: t('colBreak'), value: liveCalc.breakMinutes ? fmtMinutes(liveCalc.breakMinutes) : '—' },
                { label: t('overtimeFull'), value: liveCalc.overtimeMinutes ? fmtMinutes(liveCalc.overtimeMinutes) : '—' },
                { label: t('late'), value: liveCalc.lateMinutes ? fmtMinutes(liveCalc.lateMinutes) : '—' },
                { label: t('absence'), value: liveCalc.absenceMinutes ? fmtMinutes(liveCalc.absenceMinutes) : '—' },
              ].map(card => (
                <div key={card.label} className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-2.5 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-600">{card.label}</p>
                  <p className="text-sm font-bold tabular-nums text-slate-900 mt-0.5">{card.value}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 ml-7">
              {t('adjustLiveStatusLabel')}: <span className="font-semibold text-slate-800">{dayStatusLabel(liveCalc.status)}</span>
            </p>
          </section>
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
          {onEndContract ? (
            <button
              type="button"
              onClick={onEndContract}
              disabled={busy}
              title={t('endContractHint')}
              className="flex-1 py-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50 shadow-sm"
            >
              {t('endContract')}
            </button>
          ) : null}
          {canEditHours && remarksChanged && !localAck && (
            <button
              type="submit"
              form="timesheet-adjust-remarks-form"
              disabled={busy || !remarks.trim()}
              className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-bold hover:opacity-95 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed shadow-sm"
            >
              {isSaving ? t('adjustSaving') : t('saveJustification')}
            </button>
          )}
        </div>
      </div>

      {selfieViewerPunch ? (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('appPunchSelfie')}
          onClick={() => setSelfieViewerPunchId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
              <div>
                <p className="text-sm font-bold text-slate-900">{t('appPunchSelfie')}</p>
                <p className="text-xs text-slate-600">
                  {formatTime(selfieViewerPunch.punchedAt, { hour: '2-digit', minute: '2-digit', hour12: false })}
                  {' · '}
                  {directionLabel(selfieViewerPunch.direction, t)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelfieViewerPunchId(null)}
                className="h-9 w-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-700"
                aria-label={t('appPunchSelfieClose')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="bg-slate-100 aspect-[3/4] max-h-[70vh] flex items-center justify-center">
              {appSelfieUrls[selfieViewerPunch.id] ? (
                <img
                  src={appSelfieUrls[selfieViewerPunch.id]!}
                  alt={t('appPunchSelfie')}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <p className="text-sm text-slate-600 px-6 text-center">{t('appPunchSelfieMissing')}</p>
              )}
            </div>
            {(() => {
              const lat = selfieViewerPunch.rawPayload?.lat;
              const lng = selfieViewerPunch.rawPayload?.lng;
              const address = selfieViewerPunch.rawPayload?.address;
              const hasCoords = typeof lat === 'number' && typeof lng === 'number';
              const hasAddress = typeof address === 'string' && address.trim().length > 0;
              if (!hasCoords && !hasAddress) return null;
              return (
                <div className="px-4 py-3 border-t border-slate-200 text-xs text-slate-700 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <MapPin size={14} className="text-sky-700 shrink-0" />
                    {t('appPunchLocation')}
                  </p>
                  {hasAddress ? <p className="text-slate-800">{String(address)}</p> : null}
                  {hasCoords ? (
                    <p className="tabular-nums text-slate-600">
                      {t('appPunchLocationCoords', {
                        lat: Number(lat).toFixed(5),
                        lng: Number(lng).toFixed(5),
                      })}
                    </p>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
};
