import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Loader2,
  ArrowLeftRight,
  Copy,
  Save,
  Trash2,
  Users,
  FileDown,
  Send,
} from 'lucide-react';
import { hrService } from '../services/hrService';
import { saturdaysInMonth } from '../utils/rosterDates';
import {
  Employee,
  Holiday,
  RosterAssignmentStatus,
  RosterDayKind,
  Shift,
  WorkRosterAssignment,
} from '../types';
import { canManageRoster, isRosterEligible, isStaffAdmin } from '../utils/roles';
import { useSubscription } from '../context/SubscriptionContext';
import { resolveShiftDay } from '../services/timeCalculation.service';
import { minutesToHm } from '../utils/durationHm';
import { todayIsoLocal } from '../utils/payrollPeriod';
import RosterSwapManagerPanel from '../components/roster/RosterSwapManagerPanel';
import RosterPublishModal from '../components/roster/RosterPublishModal';
import { rosterPdfService } from '../services/rosterPdf.service';

interface Props {
  user: { id: string; role: string; name?: string };
}

type Mode = 'SATURDAY' | 'HOLIDAY';
type DayTone = 'past' | 'today' | 'future';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}


function formatDayLabel(iso: string, locale: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

function dayTone(iso: string, today: string): DayTone {
  if (iso < today) return 'past';
  if (iso === today) return 'today';
  return 'future';
}

function formatLoadMinutes(mins: number): string {
  if (!mins || mins <= 0) return '—';
  return minutesToHm(mins);
}

function chipClass(tone: DayTone, active: boolean, published: boolean): string {
  const base =
    'relative inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm border transition-all duration-150';
  if (active) {
    // Selected = what the user is editing — strongest visual signal
    return `${base} z-[1] scale-[1.06] font-bold text-white border-transparent bg-primary shadow-lg shadow-primary/40 ring-2 ring-white/40 dark:ring-white/25`;
  }
  if (tone === 'past') {
    return `${base} border-slate-600/80 bg-slate-800/50 text-slate-400 ${
      published ? 'opacity-90' : 'opacity-65'
    } hover:opacity-100 hover:border-slate-500`;
  }
  if (tone === 'today') {
    return `${base} border-sky-500/60 bg-sky-950/40 text-sky-200 hover:border-sky-400 hover:bg-sky-900/50`;
  }
  return `${base} border-emerald-700/50 bg-emerald-950/20 text-emerald-100/90 hover:border-emerald-500 hover:bg-emerald-950/40 ${
    published ? 'shadow-[inset_0_0_0_1px_rgba(16,185,129,0.35)]' : ''
  }`;
}

const WorkRoster: React.FC<Props> = ({ user }) => {
  const { t, i18n } = useTranslation('roster');
  const { canPerformAction } = useSubscription();
  const canWrite = canPerformAction('write') && canManageRoster(user.role);
  const today = todayIsoLocal();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [mode, setMode] = useState<Mode>('SATURDAY');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [publishedDates, setPublishedDates] = useState<Set<string>>(new Set());
  const [monthAssignments, setMonthAssignments] = useState<
    Array<{ workDate: string; employeeId: string; status: RosterAssignmentStatus }>
  >([]);
  const [statusByEmp, setStatusByEmp] = useState<Record<string, RosterAssignmentStatus>>({});
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [swapMode, setSwapMode] = useState(false);
  const [swapFirst, setSwapFirst] = useState<string | null>(null);
  const [fullMonthAssignments, setFullMonthAssignments] = useState<WorkRosterAssignment[]>([]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [copyMonthOpen, setCopyMonthOpen] = useState(false);
  const [copyMonthTarget, setCopyMonthTarget] = useState(() => {
    const next = new Date(year, month, 1);
    return { year: next.getFullYear(), month: next.getMonth() + 1 };
  });
  const [copyMonthBusy, setCopyMonthBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const clockEmployees = useMemo(
    () =>
      employees
        .filter(e => isRosterEligible(e))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR')),
    [employees]
  );

  const defaultShift = useMemo(
    () => shifts.find(s => s.isDefault && s.active !== false) || shifts.find(s => s.active !== false) || null,
    [shifts]
  );

  const shiftById = useMemo(() => {
    const map = new Map<string, Shift>();
    shifts.forEach(s => map.set(s.id, s));
    return map;
  }, [shifts]);

  /** Expected minutes for this date from the employee profile shift (or org default). */
  const loadMinutesFor = useCallback(
    (emp: Employee, date: string): number => {
      const shift = (emp.shiftId && shiftById.get(emp.shiftId)) || defaultShift;
      if (!shift) return 0;
      return resolveShiftDay(shift, date).expectedDailyMinutes || 0;
    },
    [shiftById, defaultShift]
  );

  const saturdays = useMemo(() => saturdaysInMonth(year, month), [year, month]);
  const monthHolidays = useMemo(() => {
    const prefix = `${year}-${pad2(month)}-`;
    return holidays.filter(h => h.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, year, month]);

  const dayList = mode === 'SATURDAY' ? saturdays : monthHolidays.map(h => h.date);

  const selectedTone = selectedDate ? dayTone(selectedDate, today) : null;
  /** Past days: view + history only. Admin/HR may still correct. */
  const canEditSelected =
    !!selectedDate &&
    canWrite &&
    (selectedTone !== 'past' || isStaffAdmin(user.role));

  const refreshPublishedMonth = useCallback(async () => {
    const start = toIso(year, month, 1);
    const end = toIso(year, month, new Date(year, month, 0).getDate());
    const rows = await hrService.listRosterAssignments(start, end);
    setPublishedDates(new Set(rows.map(r => r.workDate)));
    setFullMonthAssignments(rows);
    setMonthAssignments(
      rows.map(r => ({ workDate: r.workDate, employeeId: r.employeeId, status: r.status }))
    );
  }, [year, month]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [emps, hols, shiftList] = await Promise.all([
          hrService.getEmployees(),
          hrService.getHolidays(),
          hrService.getShifts(),
        ]);
        if (cancelled) return;
        setEmployees(emps || []);
        setHolidays(Array.isArray(hols) ? hols : []);
        setShifts(shiftList || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshPublishedMonth();
  }, [refreshPublishedMonth]);

  // Prefer next upcoming day in current month; otherwise first day
  useEffect(() => {
    if (dayList.length === 0) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate(prev => {
      if (prev && dayList.includes(prev)) return prev;
      const upcoming = dayList.find(d => d >= today);
      return upcoming || dayList[dayList.length - 1];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, mode, saturdays.join(','), monthHolidays.map(h => h.date).join(',')]);

  const loadDay = useCallback(
    async (date: string) => {
      setDayLoading(true);
      setMessage(null);
      setSwapMode(false);
      setSwapFirst(null);
      try {
        const rows = await hrService.listRosterForDate(date);
        const map: Record<string, RosterAssignmentStatus> = {};
        if (rows.length === 0) {
          clockEmployees.forEach(e => {
            map[e.id] = 'OFF';
          });
          setPublished(false);
        } else {
          clockEmployees.forEach(e => {
            const keys = [e.id, e.employeeId].filter(Boolean) as string[];
            const hit = rows.find(r => keys.includes(r.employeeId));
            map[e.id] = hit?.status || 'OFF';
          });
          setPublished(true);
        }
        setStatusByEmp(map);
      } finally {
        setDayLoading(false);
      }
    },
    [clockEmployees]
  );

  useEffect(() => {
    if (selectedDate && clockEmployees.length) {
      void loadDay(selectedDate);
    }
  }, [selectedDate, clockEmployees, loadDay]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clockEmployees;
    return clockEmployees.filter(
      e =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.employeeId || '').toLowerCase().includes(q) ||
        (e.department || '').toLowerCase().includes(q)
    );
  }, [clockEmployees, search]);

  const workingIds = useMemo(
    () => filtered.filter(e => statusByEmp[e.id] === 'WORK').map(e => e.id),
    [filtered, statusByEmp]
  );
  const offIds = useMemo(
    () => filtered.filter(e => statusByEmp[e.id] !== 'WORK').map(e => e.id),
    [filtered, statusByEmp]
  );

  /** Preview of Saturday expected minutes this month from published roster + draft of selected day. */
  const monthLoadByEmp = useMemo(() => {
    const map: Record<string, number> = {};
    clockEmployees.forEach(e => {
      map[e.id] = 0;
    });
    if (mode !== 'SATURDAY') return map;

    saturdays.forEach(sat => {
      clockEmployees.forEach(e => {
        const mins = loadMinutesFor(e, sat);
        if (!mins) return;
        const keys = [e.id, e.employeeId].filter(Boolean) as string[];

        if (sat === selectedDate) {
          if (statusByEmp[e.id] === 'WORK') map[e.id] += mins;
          return;
        }

        if (!publishedDates.has(sat)) return;
        const hit = monthAssignments.find(
          a => a.workDate === sat && keys.includes(a.employeeId) && a.status === 'WORK'
        );
        if (hit) map[e.id] += mins;
      });
    });
    return map;
  }, [
    clockEmployees,
    mode,
    selectedDate,
    saturdays,
    statusByEmp,
    publishedDates,
    monthAssignments,
    loadMinutesFor,
  ]);

  const setStatus = (id: string, status: RosterAssignmentStatus) => {
    setStatusByEmp(prev => ({ ...prev, [id]: status }));
  };

  const handlePersonClick = (id: string) => {
    if (!canEditSelected) return;
    if (swapMode) {
      if (!swapFirst) {
        setSwapFirst(id);
        return;
      }
      if (swapFirst === id) {
        setSwapFirst(null);
        return;
      }
      const a = statusByEmp[swapFirst] || 'OFF';
      const b = statusByEmp[id] || 'OFF';
      setStatusByEmp(prev => ({
        ...prev,
        [swapFirst]: b,
        [id]: a,
      }));
      setSwapFirst(null);
      setSwapMode(false);
      return;
    }
    setStatus(id, statusByEmp[id] === 'WORK' ? 'OFF' : 'WORK');
  };

  const syncTimesheetForDate = async (date: string) => {
    await Promise.all(
      clockEmployees.map(e =>
        hrService.recalculateTimesheetDay(e.id, date).catch(err => {
          console.warn('[roster] timesheet recalc failed', e.id, err);
        })
      )
    );
  };

  const handleSave = async () => {
    if (!selectedDate || !canEditSelected) return;
    setSaving(true);
    setMessage(null);
    try {
      const dayKind: RosterDayKind = mode === 'HOLIDAY' ? 'HOLIDAY' : 'SATURDAY';
      const assignments = clockEmployees.map(e => ({
        employeeId: e.id,
        status: (statusByEmp[e.id] || 'OFF') as RosterAssignmentStatus,
      }));
      await hrService.saveRosterDay({
        workDate: selectedDate,
        dayKind,
        assignments,
        createdBy: user.id,
      });
      setPublished(true);
      await refreshPublishedMonth();
      setMessage(t('syncingTimesheet'));
      await syncTimesheetForDate(selectedDate);
      setMessage(t('savedWithTimesheet'));
    } catch (e) {
      console.error(e);
      setMessage(t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!selectedDate || !canEditSelected) return;
    if (!window.confirm(t('clearConfirm'))) return;
    setSaving(true);
    try {
      await hrService.saveRosterDay({
        workDate: selectedDate,
        dayKind: mode === 'HOLIDAY' ? 'HOLIDAY' : 'SATURDAY',
        assignments: [],
        createdBy: user.id,
      });
      const map: Record<string, RosterAssignmentStatus> = {};
      clockEmployees.forEach(e => {
        map[e.id] = 'OFF';
      });
      setStatusByEmp(map);
      setPublished(false);
      await refreshPublishedMonth();
      await syncTimesheetForDate(selectedDate);
      setMessage(t('savedWithTimesheet'));
    } catch (e) {
      console.error(e);
      setMessage(t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPrev = async () => {
    if (!selectedDate || mode !== 'SATURDAY' || !canEditSelected) return;
    const idx = saturdays.indexOf(selectedDate);
    if (idx <= 0) {
      setMessage(t('noPrev'));
      return;
    }
    const prev = saturdays[idx - 1];
    const rows = await hrService.listRosterForDate(prev);
    if (rows.length === 0) {
      setMessage(t('noPrev'));
      return;
    }
    const map: Record<string, RosterAssignmentStatus> = {};
    clockEmployees.forEach(e => {
      const keys = [e.id, e.employeeId].filter(Boolean) as string[];
      const hit = rows.find(r => keys.includes(r.employeeId));
      map[e.id] = hit?.status || 'OFF';
    });
    setStatusByEmp(map);
    setMessage(t('copyPrevHint'));
  };

  const pdfLabels = useMemo(() => ({
    titleTeam: t('pdfTitleTeam'),
    titleIndividual: t('pdfTitleIndividual'),
    monthLabel: t('month'),
    employee: t('pdfEmployee'),
    shift: t('pdfShift'),
    department: t('pdfDepartment'),
    legendTitle: t('pdfLegendTitle'),
    legendWork: t('working'),
    legendOff: t('off'),
    legendHoliday: t('holidayLabel'),
    legendSaturday: t('saturdayLabel'),
    legendShiftDay: t('pdfShiftDay'),
    abbrevWork: t('pdfAbbrevWork'),
    abbrevOff: t('pdfAbbrevOff'),
    colDate: t('pdfColDate'),
    colDay: t('pdfColDay'),
    colStatus: t('pdfColStatus'),
    colShift: t('pdfColShift'),
    generatedAt: t('pdfGenerated'),
    page: t('pdfPage'),
  }), [t]);

  const handleExportTeamPdf = async () => {
    setPdfBusy(true);
    try {
      await rosterPdfService.exportTeamPdf({
        year,
        month,
        employees: clockEmployees,
        shifts,
        holidays: monthHolidays.length ? monthHolidays : holidays,
        rosterAssignments: fullMonthAssignments,
        labels: pdfLabels,
        locale: i18n.language === 'en' ? 'en-US' : 'pt-BR',
      });
    } catch (e) {
      console.error(e);
      setMessage(t('pdfError'));
    } finally {
      setPdfBusy(false);
    }
  };

  if (!canManageRoster(user.role)) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Users className="mx-auto mb-3 opacity-40" size={40} />
        <p>{t('forbidden')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const holidayName = (iso: string) => monthHolidays.find(h => h.date === iso)?.name;

  const renderColumn = (ids: string[], column: 'WORK' | 'OFF') => (
    <div className="flex-1 min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <div
        className={`px-4 py-2.5 text-sm font-semibold border-b border-slate-100 dark:border-slate-800 ${
          column === 'WORK'
            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
            : 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'
        }`}
      >
        {column === 'WORK'
          ? t('workingCount', { count: ids.length })
          : t('offCount', { count: ids.length })}
      </div>
      <ul className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {ids.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-slate-400">
            {selectedDate ? t('emptyColumn') : t('selectDay')}
          </li>
        ) : (
          ids.map(id => {
            const emp = clockEmployees.find(e => e.id === id);
            if (!emp || !selectedDate) return null;
            const selected = swapFirst === id;
            const mins = loadMinutesFor(emp, selectedDate);
            const shift = (emp.shiftId && shiftById.get(emp.shiftId)) || defaultShift;
            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={!canEditSelected}
                  onClick={() => handlePersonClick(id)}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors ${
                    selected
                      ? 'bg-amber-100 dark:bg-amber-900/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                  } ${!canEditSelected ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                      {emp.name}
                    </span>
                    <span className="block text-xs text-slate-400 truncate">
                      {[emp.employeeId, emp.department, shift?.name].filter(Boolean).join(' · ')}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {t('loadHours', { hours: formatLoadMinutes(mins) })}
                      {column === 'WORK' && monthLoadByEmp[id] > 0
                        ? ` · ${t('monthLoadHint', { hours: formatLoadMinutes(monthLoadByEmp[id]) })}`
                        : null}
                    </span>
                  </span>
                  {canEditSelected && !swapMode && (
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 shrink-0">
                      {column === 'WORK' ? t('moveToOff') : t('moveToWork')}
                    </span>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );

  const handleCopyMonth = async () => {
    if (copyMonthBusy || publishedDates.size === 0) return;
    
    // Check if target month has published saturdays
    const targetSats = saturdaysInMonth(copyMonthTarget.year, copyMonthTarget.month);
    let hasTarget = false;
    for (const sat of targetSats) {
      const existing = await hrService.listRosterForDate(sat);
      if (existing.length > 0) {
        hasTarget = true;
        break;
      }
    }
    
    if (hasTarget && !window.confirm(t('copyMonthConfirmOverwrite'))) {
      return;
    }

    setCopyMonthBusy(true);
    try {
      const res = await hrService.copyMonthSaturdays({
        sourceYear: year,
        sourceMonth: month,
        targetYear: copyMonthTarget.year,
        targetMonth: copyMonthTarget.month,
        createdBy: user.id,
      });
      
      for (const pair of res.copiedDates) {
        await syncTimesheetForDate(pair.to);
      }
      
      setCopyMonthOpen(false);
      setYear(copyMonthTarget.year);
      setMonth(copyMonthTarget.month);
      // Mode will refresh via useEffect
    } catch (err) {
      console.error(err);
      setMessage(t('saveError'));
    } finally {
      setCopyMonthBusy(false);
    }
  };

  const copyMonthModal = copyMonthOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold">{t('copyMonth')}</h2>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            {t('copyMonthDesc', { 
              source: `${pad2(month)}/${year}`, 
              target: `${pad2(copyMonthTarget.month)}/${copyMonthTarget.year}` 
            })}
          </p>
          
          <div className="flex gap-4">
            <label className="flex-1">
              <span className="block text-xs text-slate-400 mb-1">{t('month')}</span>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                value={copyMonthTarget.month}
                onChange={e => setCopyMonthTarget(s => ({ ...s, month: Number(e.target.value) }))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleString(i18n.language === 'en' ? 'en' : 'pt-BR', { month: 'long' })}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1">
              <span className="block text-xs text-slate-400 mb-1">{t('year')}</span>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                value={copyMonthTarget.year}
                onChange={e => setCopyMonthTarget(s => ({ ...s, year: Number(e.target.value) }))}
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            disabled={copyMonthBusy}
            onClick={() => setCopyMonthOpen(false)}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={copyMonthBusy}
            onClick={() => void handleCopyMonth()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white disabled:opacity-50"
          >
            {copyMonthBusy && <Loader2 size={16} className="animate-spin" />}
            {t('copyMonth')}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="text-primary" size={22} />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={publishedDates.size === 0}
            onClick={() => setCopyMonthOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 disabled:opacity-50"
          >
            <Copy size={16} />
            {t('copyMonth')}
          </button>
          <button
            type="button"
            disabled={pdfBusy || publishedDates.size === 0}
            onClick={() => void handleExportTeamPdf()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 disabled:opacity-50"
          >
            {pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            {t('exportTeamPdf')}
          </button>
          <button
            type="button"
            disabled={publishedDates.size === 0}
            onClick={() => setPublishOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white disabled:opacity-50"
          >
            <Send size={16} />
            {t('publishAndSend')}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <span className="block text-xs text-slate-400 mb-1">{t('month')}</span>
          <select
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleString(i18n.language === 'en' ? 'en' : 'pt-BR', {
                  month: 'long',
                })}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-400 mb-1">{t('year')}</span>
          <select
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium ${
              mode === 'SATURDAY'
                ? 'bg-primary text-white'
                : 'bg-white dark:bg-slate-900 text-slate-600'
            }`}
            onClick={() => setMode('SATURDAY')}
          >
            {t('saturdays')}
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium ${
              mode === 'HOLIDAY'
                ? 'bg-primary text-white'
                : 'bg-white dark:bg-slate-900 text-slate-600'
            }`}
            onClick={() => setMode('HOLIDAY')}
          >
            {t('holidays')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-slate-600/80 border border-slate-500" />
          {t('legendPast')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-sky-500/80 border border-sky-400" />
          {t('legendToday')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-700/70 border border-emerald-500" />
          {t('legendFuture')}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {dayList.length === 0 ? (
          <p className="text-sm text-slate-400">
            {mode === 'SATURDAY' ? t('noSaturdays') : t('noHolidays')}
          </p>
        ) : (
          dayList.map(iso => {
            const active = selectedDate === iso;
            const tone = dayTone(iso, today);
            const isPub = publishedDates.has(iso);
            const label =
              mode === 'HOLIDAY'
                ? `${formatDayLabel(iso, i18n.language)} — ${holidayName(iso) || t('holidayLabel')}`
                : formatDayLabel(iso, i18n.language);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDate(iso)}
                aria-pressed={active}
                aria-current={active ? 'date' : undefined}
                title={
                  active
                    ? t('editingThisDay')
                    : tone === 'past'
                      ? t('chipPastTitle')
                      : isPub
                        ? t('published')
                        : t('unpublished')
                }
                className={chipClass(tone, active, isPub)}
              >
                {active ? (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" aria-hidden />
                ) : null}
                <span>{label}</span>
                {active ? (
                  <span className="ml-0.5 text-[10px] uppercase tracking-wide bg-white/20 px-1.5 py-0.5 rounded-full">
                    {canEditSelected ? t('chipEditing') : t('chipViewing')}
                  </span>
                ) : tone === 'past' ? (
                  <span className="text-[10px] uppercase opacity-70">{t('chipPast')}</span>
                ) : null}
                {!active && isPub ? (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                ) : null}
              </button>
            );
          })
        )}
      </div>

      {selectedDate && (
        <>
          <div
            className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
              selectedTone === 'past'
                ? 'border-slate-600 bg-slate-800/40'
                : 'border-primary/40 bg-primary/10'
            }`}
          >
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                {canEditSelected ? t('editingPanelTitle') : t('viewingPanelTitle')}
              </p>
              <p className="text-lg font-bold text-slate-900 dark:text-white truncate">
                {mode === 'HOLIDAY'
                  ? `${formatDayLabel(selectedDate, i18n.language)} — ${holidayName(selectedDate) || t('holidayLabel')}`
                  : formatDayLabel(selectedDate, i18n.language)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedTone === 'past'
                  ? t('pastBanner')
                  : mode === 'HOLIDAY'
                    ? t('hintHoliday')
                    : t('hintSaturday')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {selectedTone === 'past' && (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-700/80 text-slate-200">
                  {t('chipPast')}
                </span>
              )}
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  published
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                }`}
              >
                {published ? t('published') : t('unpublished')}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-400">{t('loadFromShiftHint')}</p>

          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('search')}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm min-w-[12rem] flex-1 max-w-xs"
            />
            {canEditSelected && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSwapMode(s => !s);
                    setSwapFirst(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border ${
                    swapMode
                      ? 'border-amber-400 bg-amber-50 text-amber-900'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <ArrowLeftRight size={16} />
                  {swapMode ? t('swapCancel') : t('swapMode')}
                </button>
                {mode === 'SATURDAY' && (
                  <button
                    type="button"
                    onClick={() => void handleCopyPrev()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700"
                    title={t('copyPrevHint')}
                  >
                    <Copy size={16} />
                    {t('copyPrev')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white disabled:opacity-60"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  {saving ? t('saving') : t('save')}
                </button>
                {published && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleClear()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-red-200 text-red-700 dark:border-red-900 dark:text-red-300"
                  >
                    <Trash2 size={16} />
                    {t('clear')}
                  </button>
                )}
              </>
            )}
            {!canEditSelected && canWrite && selectedTone === 'past' && (
              <span className="text-xs text-slate-400">{t('pastReadOnlyManager')}</span>
            )}
          </div>

          {swapMode && canEditSelected && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {swapFirst ? t('swapPickSecond') : t('swapPickFirst')} — {t('swapHint')}
            </p>
          )}

          {message && (
            <p className="text-sm text-slate-600 dark:text-slate-300" role="status">
              {message}
            </p>
          )}

          {dayLoading ? (
            <div className="h-40 flex items-center justify-center text-slate-400">
              <Loader2 className="animate-spin" size={28} />
            </div>
          ) : clockEmployees.length === 0 ? (
            <p className="text-sm text-slate-400">{t('emptyTeam')}</p>
          ) : (
            <div className="flex flex-col md:flex-row gap-4">
              {renderColumn(workingIds, 'WORK')}
              {renderColumn(offIds, 'OFF')}
            </div>
          )}
        </>
      )}
      <RosterSwapManagerPanel />
      <RosterPublishModal
        isOpen={publishOpen}
        onClose={() => setPublishOpen(false)}
        year={year}
        month={month}
        employees={clockEmployees}
        shifts={shifts}
        holidays={monthHolidays.length ? monthHolidays : holidays}
        rosterAssignments={fullMonthAssignments}
        pdfLabels={pdfLabels}
        locale={i18n.language === 'en' ? 'en-US' : 'pt-BR'}
      />
      {copyMonthModal}
    </div>
  );
};

export default WorkRoster;
