import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays, RefreshCw, Download, Lock, CheckCircle2, Scale, FileJson,
} from 'lucide-react';
import { hrService } from '../services/hrService';
import {
  Employee, Punch, TimesheetDay, TimesheetPeriod, TimesheetPeriodStatus, User,
} from '../types';
import { useToast } from '../context/ToastContext';
import HelpButton from '../components/onboarding/HelpButton';
import { formatDateTime, formatIsoDateBr, getDateLocale } from '../i18n/format';
import { competenceForDate, eachDateInRange, todayIsoLocal } from '../utils/payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../constants';

interface Props {
  user: User;
}

function fmtMinutes(mins: number, t: (k: string, o?: object) => string) {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  const sign = mins < 0 ? '-' : '';
  return `${sign}${t('hoursShort', { h, m })}`;
}

const statusLabelKey: Record<TimesheetPeriodStatus, string> = {
  OPEN: 'statusOpen',
  IN_REVIEW: 'statusInReview',
  APPROVED: 'statusApproved',
  LOCKED: 'statusLocked',
};

const dayStatusKey: Record<string, string> = {
  OK: 'dayStatus_OK',
  ABSENT: 'dayStatus_ABSENT',
  INCOMPLETE: 'dayStatus_INCOMPLETE',
  HOLIDAY: 'dayStatus_HOLIDAY',
  LEAVE: 'dayStatus_LEAVE',
  ADJUSTED: 'dayStatus_ADJUSTED',
};

const Timesheet: React.FC<Props> = ({ user }) => {
  const { t } = useTranslation('ptrp');
  const { showToast } = useToast();
  const isHr = user.role === 'ADMIN' || user.role === 'HR';
  const isManager = user.role === 'MANAGER' || isHr;

  const initialCompetence = competenceForDate(new Date(), DEFAULT_PTRP_POLICY.periodStartDay);
  const [year, setYear] = useState(initialCompetence.year);
  const [month, setMonth] = useState(initialCompetence.month);
  const [dayFilter, setDayFilter] = useState('ALL');
  const [period, setPeriod] = useState<TimesheetPeriod | null>(null);
  const [days, setDays] = useState<TimesheetDay[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  /** Managers/HR start with no employee selected — data loads only after Apply. */
  const [employeeFilter, setEmployeeFilter] = useState(
    isHr || isManager ? '' : user.id
  );
  const [hasQuery, setHasQuery] = useState(!(isHr || isManager));
  const [bankBalance, setBankBalance] = useState(0);
  const [bankEntries, setBankEntries] = useState<Awaited<ReturnType<typeof hrService.listHourBankEntries>>>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRecalc, setIsRecalc] = useState(false);
  const [adjustDay, setAdjustDay] = useState<TimesheetDay | null>(null);
  const [adjustForm, setAdjustForm] = useState({ workedMinutes: 0, overtimeMinutes: 0, lateMinutes: 0, remarks: '' });
  const [showManualPunch, setShowManualPunch] = useState(false);
  const [punchForm, setPunchForm] = useState({
    employeeId: '',
    punchedAt: '',
    direction: 'IN' as Punch['direction'],
  });
  const [selectedDayIds, setSelectedDayIds] = useState<string[]>([]);
  const [isBulkAck, setIsBulkAck] = useState(false);

  const locked = period?.status === 'LOCKED';
  const mustPickEmployee = isHr || isManager;

  const clearResults = useCallback(() => {
    setDays([]);
    setPunches([]);
    setBankEntries([]);
    setBankBalance(0);
    setSelectedDayIds([]);
    setHasQuery(false);
  }, []);

  const load = useCallback(async () => {
    if (mustPickEmployee && !employeeFilter) {
      showToast(t('selectEmployeeToLoad'), 'warning');
      return;
    }
    setIsLoading(true);
    try {
      const [emps, p] = await Promise.all([
        hrService.getEmployees(),
        hrService.getOrCreateTimesheetPeriod(year, month),
      ]);
      const staff = emps.filter(e => e.role !== 'SUPER_ADMIN');
      setEmployees(staff);
      setPeriod(p);

      const empId =
        employeeFilter === 'ALL'
          ? undefined
          : staff.find(e => e.id === employeeFilter)?.employeeId ||
            employeeFilter;

      const list = await hrService.listTimesheetDays(p.id, empId);
      const filtered =
        employeeFilter === 'ALL'
          ? list
          : list.filter(d => {
              const emp = staff.find(e => e.id === employeeFilter || e.employeeId === employeeFilter);
              return (
                d.employeeId === employeeFilter ||
                d.employeeId === emp?.id ||
                d.employeeId === emp?.employeeId
              );
            });
      setDays(employeeFilter === 'ALL' ? list : filtered);

      const bankEmp =
        employeeFilter === 'ALL'
          ? user.employeeId || user.id
          : staff.find(e => e.id === employeeFilter)?.employeeId || employeeFilter;
      const start = p.startDate;
      const end = p.endDate;
      const [bal, entries, punchList] = await Promise.all([
        hrService.getHourBankBalance(bankEmp),
        hrService.listHourBankEntries(bankEmp, start, end),
        hrService.listPunches({
          employeeId: employeeFilter === 'ALL' ? undefined : bankEmp,
          startDate: start,
          endDate: end,
        }),
      ]);
      setBankBalance(bal);
      setBankEntries(entries);
      setPunches(punchList);

      // Auto-recalc days that have clock punches but no espelho row yet (REP ingest).
      if (
        employeeFilter !== 'ALL' &&
        bankEmp &&
        punchList.length > 0 &&
        p.status !== 'LOCKED'
      ) {
        const dayByDate = new Map(filtered.map(d => [d.workDate, d]));
        const punchDates = [
          ...new Set(
            punchList.map(px => {
              const iso = px.punchedAt.includes('T') ? px.punchedAt.split('T')[0]! : px.punchedAt.slice(0, 10);
              return iso;
            }),
          ),
        ].slice(0, 14);
        const staleDates = punchDates.filter(d => {
          const row = dayByDate.get(d);
          return !row || !row.firstPunchAt;
        });
        if (staleDates.length > 0) {
          await Promise.all(
            staleDates.map(d => hrService.recalculateTimesheetDay(bankEmp, d, p).catch(() => null)),
          );
          const refreshed = await hrService.listTimesheetDays(p.id, empId);
          const refFiltered =
            employeeFilter === 'ALL'
              ? refreshed
              : refreshed.filter(d => {
                  const emp = staff.find(e => e.id === employeeFilter || e.employeeId === employeeFilter);
                  return (
                    d.employeeId === employeeFilter ||
                    d.employeeId === emp?.id ||
                    d.employeeId === emp?.employeeId
                  );
                });
          setDays(employeeFilter === 'ALL' ? refreshed : refFiltered);
        }
      }

      setHasQuery(true);
    } catch (e: any) {
      console.error(e);
      showToast(t('loadFailed'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [year, month, employeeFilter, mustPickEmployee, user.id, user.employeeId, showToast, t]);

  /** Bootstrap employee list + period shell (no timesheet rows). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsBootstrapping(true);
      try {
        const [emps, p] = await Promise.all([
          hrService.getEmployees(),
          hrService.getOrCreateTimesheetPeriod(year, month),
        ]);
        if (cancelled) return;
        setEmployees(emps.filter(e => e.role !== 'SUPER_ADMIN'));
        setPeriod(p);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
  }, [year, month]);

  /** Employees see their own mirror immediately; managers wait for Apply. */
  useEffect(() => {
    if (!mustPickEmployee) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot for self view
  }, []);

  const filtersPrimed = useRef(false);
  useEffect(() => {
    setDayFilter('ALL');
    setSelectedDayIds([]);
    // Skip first run so employee auto-load is not wiped; later filter changes require Apply.
    if (!filtersPrimed.current) {
      filtersPrimed.current = true;
      return;
    }
    clearResults();
  }, [year, month, employeeFilter, clearResults]);

  const applyFilters = async () => {
    await load();
  };

  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const label = new Date(year, i, 1).toLocaleDateString(getDateLocale(), { month: 'long' });
      return { value: i + 1, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  }, [year]);

  const periodDayOptions = useMemo(() => {
    if (!period?.startDate || !period?.endDate) return [] as string[];
    const today = todayIsoLocal();
    return eachDateInRange(period.startDate, period.endDate).filter(iso => iso <= today);
  }, [period?.startDate, period?.endDate]);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
  }, []);

  const elapsedDays = useMemo(() => {
    const today = todayIsoLocal();
    return days.filter(d => d.workDate <= today);
  }, [days]);

  const visibleDays = useMemo(() => {
    if (dayFilter === 'ALL') return elapsedDays;
    return elapsedDays.filter(d => d.workDate === dayFilter);
  }, [elapsedDays, dayFilter]);

  /** Hours target for the same employee shown in the hour-bank panel. */
  const periodHours = useMemo(() => {
    const today = todayIsoLocal();
    const bankKey =
      employeeFilter === 'ALL'
        ? user.employeeId || user.id
        : employees.find(e => e.id === employeeFilter)?.employeeId || employeeFilter;
    const emp = employees.find(e => e.id === employeeFilter || e.employeeId === employeeFilter);
    const scope = days.filter(d => {
      if (d.workDate > today) return false;
      return (
        d.employeeId === bankKey ||
        d.employeeId === emp?.id ||
        d.employeeId === emp?.employeeId
      );
    });
    const expected = scope.reduce((s, d) => s + (d.expectedMinutes || 0), 0);
    const worked = scope.reduce((s, d) => s + (d.workedMinutes || 0), 0);
    const remaining = Math.max(0, expected - worked);
    return { expected, worked, remaining, dayCount: scope.length };
  }, [days, employeeFilter, employees, user.employeeId, user.id]);

  useEffect(() => {
    if (dayFilter !== 'ALL' && dayFilter > todayIsoLocal()) {
      setDayFilter('ALL');
    }
  }, [dayFilter, period?.endDate]);

  const pendingManagerAckIds = useMemo(() => {
    if (!isManager || locked) return [] as string[];
    return visibleDays.filter(d => !d.managerAck).map(d => d.id);
  }, [visibleDays, isManager, locked]);

  const allPendingSelected =
    pendingManagerAckIds.length > 0 &&
    pendingManagerAckIds.every(id => selectedDayIds.includes(id));

  const toggleSelectDay = (id: string) => {
    setSelectedDayIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPending = () => {
    if (allPendingSelected) {
      setSelectedDayIds(prev => prev.filter(id => !pendingManagerAckIds.includes(id)));
    } else {
      setSelectedDayIds(prev => [...new Set([...prev, ...pendingManagerAckIds])]);
    }
  };

  const handleBulkManagerAck = async (ids: string[]) => {
    if (locked || ids.length === 0) return;
    setIsBulkAck(true);
    try {
      const count = await hrService.acknowledgeTimesheetDays(ids, 'manager');
      showToast(t('bulkManagerAckOk', { count }), 'success');
      setSelectedDayIds([]);
      await load();
    } catch (e: any) {
      showToast(e?.message || t('bulkManagerAckFailed'), 'error');
    } finally {
      setIsBulkAck(false);
    }
  };

  const entryTypeLabel = (type: string) => {
    const key = `entryTypes.${type}`;
    const translated = t(key);
    return translated === key ? type : translated;
  };

  useEffect(() => {
    setSelectedDayIds([]);
  }, [dayFilter]);

  const periodSummary = useMemo(() => {
    if (!period) return '';
    return t('periodRange', {
      start: formatIsoDateBr(period.startDate),
      end: formatIsoDateBr(period.endDate),
    });
  }, [period, t]);

  const showRecalcHint = useMemo(() => {
    if (punches.length === 0) return false;
    return visibleDays.length > 0 && visibleDays.every(d => d.workedMinutes === 0);
  }, [punches.length, visibleDays]);

  const visiblePunches = useMemo(() => {
    if (dayFilter === 'ALL') return punches;
    return punches.filter(p => p.punchedAt.slice(0, 10) === dayFilter);
  }, [punches, dayFilter]);

  const dayStatusLabel = (status: string) => {
    const key = dayStatusKey[status];
    return key ? t(key) : status;
  };

  const empName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees) {
      map.set(e.id, e.name);
      if (e.employeeId) map.set(e.employeeId, e.name);
    }
    return (id: string) => map.get(id) || id;
  }, [employees]);

  const handleRecalc = async () => {
    if (locked) return;
    setIsRecalc(true);
    try {
      const ids =
        employeeFilter === 'ALL'
          ? undefined
          : [employeeFilter];
      const count = await hrService.recalculateTimesheetPeriod(year, month, ids);
      showToast(t('recalcOk', { count }), 'success');
      await load();
    } catch (e: any) {
      showToast(e?.message || t('recalcFailed'), 'error');
    } finally {
      setIsRecalc(false);
    }
  };

  const setStatus = async (status: TimesheetPeriodStatus) => {
    if (!period) return;
    try {
      await hrService.setTimesheetPeriodStatus(period.id, status, user.id);
      showToast(t('periodStatusOk'), 'success');
      await load();
    } catch (e: any) {
      showToast(e?.message || t('loadFailed'), 'error');
    }
  };

  const handleExport = async () => {
    if (!period) return;
    try {
      const csv = await hrService.exportTimesheetCsv(period.id);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `espelho_${year}_${String(month).padStart(2, '0')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('exportOk'), 'success');
    } catch (e: any) {
      showToast(e?.message || t('loadFailed'), 'error');
    }
  };

  const handleEsocial = async () => {
    if (!period) return;
    try {
      const stub = await hrService.generateEsocialStub(period.id);
      const blob = new Blob([JSON.stringify(stub.payload ?? stub, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `esocial_stub_${year}_${String(month).padStart(2, '0')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('exportOk'), 'success');
    } catch (e: any) {
      showToast(e?.message || t('loadFailed'), 'error');
    }
  };

  const openAdjust = (day: TimesheetDay) => {
    setAdjustDay(day);
    setAdjustForm({
      workedMinutes: day.workedMinutes,
      overtimeMinutes: day.overtimeMinutes,
      lateMinutes: day.lateMinutes,
      remarks: day.remarks || '',
    });
  };

  const saveAdjust = async () => {
    if (!adjustDay || locked) return;
    try {
      await hrService.applyTimesheetAdjustment(
        adjustDay.id,
        {
          workedMinutes: adjustForm.workedMinutes,
          overtimeMinutes: adjustForm.overtimeMinutes,
          lateMinutes: adjustForm.lateMinutes,
        },
        adjustForm.remarks
      );
      setAdjustDay(null);
      await load();
    } catch (e: any) {
      showToast(e?.message || t('loadFailed'), 'error');
    }
  };

  const saveManualPunch = async () => {
    if (!punchForm.employeeId || !punchForm.punchedAt) return;
    try {
      const emp = employees.find(e => e.id === punchForm.employeeId);
      await hrService.createManualPunch({
        employeeId: emp?.employeeId || punchForm.employeeId,
        punchedAt: new Date(punchForm.punchedAt).toISOString(),
        direction: punchForm.direction,
      });
      showToast(t('punchSaved'), 'success');
      setShowManualPunch(false);
      await load();
    } catch (e: any) {
      showToast(e?.message || t('punchFailed'), 'error');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight text-balance">{t('title')}</h1>
            <HelpButton helpPointId="timesheet.espelho" />
          </div>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{t('periodHint')}</p>
          {periodSummary ? (
            <p className="text-xs text-slate-400 mt-0.5">{periodSummary}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {period && (
            <span className="px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
              {t(statusLabelKey[period.status])}
            </span>
          )}
          {locked ? (
            <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
              <Lock size={14} aria-hidden /> {t('lockedHint')}
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
        <p className="font-semibold">{t('dataSourceTitle')}</p>
        <p className="text-xs mt-1 text-sky-800">{t('dataSourceBody')}</p>
      </div>

      {(punches.length === 0 || showRecalcHint) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {punches.length === 0 ? t('noPunchesDetail') : t('hasPunchesNoWork', { count: punches.length })}
        </div>
      )}

      {/* Toolbar: equal filter fields (same label + control rhythm) then actions */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-4">
        <div
          className={`grid gap-x-4 gap-y-3 items-start ${
            isHr || isManager
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
              : 'grid-cols-1 sm:grid-cols-3'
          }`}
        >
          <div className="space-y-1.5 min-w-0">
            <label htmlFor="ts-year" className="block text-xs font-medium text-slate-500 leading-4">
              {t('year')}
            </label>
            <select
              id="ts-year"
              className="h-10 w-full px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800"
              value={year}
              onChange={e => setYear(parseInt(e.target.value, 10))}
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 min-w-0">
            <label htmlFor="ts-month" className="block text-xs font-medium text-slate-500 leading-4">
              {t('month')}
            </label>
            <select
              id="ts-month"
              className="h-10 w-full px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800"
              value={month}
              onChange={e => setMonth(parseInt(e.target.value, 10))}
            >
              {monthOptions.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 min-w-0">
            <label htmlFor="ts-day" className="block text-xs font-medium text-slate-500 leading-4">
              {t('day')}
            </label>
            <select
              id="ts-day"
              className="h-10 w-full px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800"
              value={dayFilter}
              onChange={e => setDayFilter(e.target.value)}
            >
              <option value="ALL">{t('allDays')}</option>
              {periodDayOptions.map(iso => (
                <option key={iso} value={iso}>{formatIsoDateBr(iso)}</option>
              ))}
            </select>
          </div>

          {(isHr || isManager) && (
            <div className="space-y-1.5 min-w-0">
              <label htmlFor="ts-employee" className="block text-xs font-medium text-slate-500 leading-4">
                {t('employee')}
              </label>
              <select
                id="ts-employee"
                className="h-10 w-full px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800"
                value={employeeFilter}
                onChange={e => setEmployeeFilter(e.target.value)}
              >
                <option value="">{t('selectEmployeePlaceholder')}</option>
                {isHr && <option value="ALL">{t('allEmployees')}</option>}
                {employees
                  .filter(e => isHr || e.lineManagerId === user.id || e.id === user.id)
                  .map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => void applyFilters()}
            disabled={isLoading || isBootstrapping || (mustPickEmployee && !employeeFilter)}
            className="h-10 px-4 bg-primary text-white rounded-lg text-xs font-semibold tracking-wide flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} aria-hidden />
            {isLoading ? t('loadingFilters') : t('applyFilters')}
          </button>
          {isHr && (
            <>
            {!locked && (
              <button
                type="button"
                onClick={handleRecalc}
                disabled={isRecalc || !hasQuery}
                className="h-10 px-4 bg-slate-800 text-white rounded-lg text-xs font-semibold tracking-wide flex items-center gap-2 disabled:opacity-60"
              >
                <RefreshCw size={14} className={isRecalc ? 'animate-spin' : ''} aria-hidden />
                {isRecalc ? t('recalculating') : t('recalculate')}
              </button>
            )}
            <button
              type="button"
              onClick={handleExport}
              disabled={!hasQuery || !period}
              className="h-10 px-4 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold tracking-wide flex items-center gap-2 disabled:opacity-60"
            >
              <Download size={14} aria-hidden /> {t('exportCsv')}
            </button>
            <button
              type="button"
              onClick={handleEsocial}
              className="h-10 px-4 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold tracking-wide flex items-center gap-2 hover:bg-slate-50"
            >
              <FileJson size={14} aria-hidden /> {t('esocialStub')}
            </button>
            {period && period.status === 'OPEN' && (
              <button
                type="button"
                onClick={() => setStatus('IN_REVIEW')}
                className="h-10 px-4 border border-slate-200 rounded-lg text-xs font-semibold"
              >
                {t('setInReview')}
              </button>
            )}
            {period && period.status === 'IN_REVIEW' && (
              <button
                type="button"
                onClick={() => setStatus('APPROVED')}
                className="h-10 px-4 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold flex items-center gap-1"
              >
                <CheckCircle2 size={14} aria-hidden /> {t('setApproved')}
              </button>
            )}
            {period && period.status === 'APPROVED' && (
              <button
                type="button"
                onClick={() => setStatus('LOCKED')}
                className="h-10 px-4 border border-amber-200 text-amber-700 rounded-lg text-xs font-semibold flex items-center gap-1"
              >
                <Lock size={14} aria-hidden /> {t('setLocked')}
              </button>
            )}
            </>
          )}
        </div>
      </div>

      {/* Primary mirror + secondary rail */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_17.5rem] gap-4 items-start">
        <div className="min-w-0 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <CalendarDays size={16} className="text-primary shrink-0" aria-hidden />
              <h2 className="text-sm font-semibold text-slate-800">{t('daysTitle')}</h2>
              {isManager && !locked && pendingManagerAckIds.length > 0 && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  {t('pendingManagerAck', { count: pendingManagerAckIds.length })}
                </span>
              )}
            </div>
            {isManager && !locked && pendingManagerAckIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {selectedDayIds.length > 0 && (
                  <button
                    type="button"
                    disabled={isBulkAck}
                    onClick={() => handleBulkManagerAck(selectedDayIds.filter(id => pendingManagerAckIds.includes(id)))}
                    className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-semibold tracking-wide hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isBulkAck ? t('bulkManagerAckWorking') : t('bulkManagerAck', { count: selectedDayIds.filter(id => pendingManagerAckIds.includes(id)).length })}
                  </button>
                )}
                <button
                  type="button"
                  disabled={isBulkAck}
                  onClick={() => handleBulkManagerAck(pendingManagerAckIds)}
                  className="h-8 px-3 border border-emerald-200 text-emerald-800 bg-emerald-50 rounded-lg text-xs font-semibold tracking-wide hover:bg-emerald-100 disabled:opacity-60"
                >
                  {t('approveAllPending', { count: pendingManagerAckIds.length })}
                </button>
              </div>
            )}
          </div>
          {isLoading || isBootstrapping ? (
            <div className="p-10 flex justify-center"><RefreshCw className="animate-spin text-primary" aria-hidden /></div>
          ) : !hasQuery ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700">{t('idleTitle')}</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">{t('idleHint')}</p>
            </div>
          ) : days.length === 0 ? (
            <p className="p-10 text-center text-slate-500 text-sm">{t('noDays')}</p>
          ) : visibleDays.length === 0 ? (
            <p className="p-10 text-center text-slate-500 text-sm">{t('allDays')}: {t('noDays')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left text-sm border-collapse">
                <thead className="bg-slate-50 text-slate-500 sticky top-0 z-[1]">
                  <tr>
                    {isManager && !locked && (
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary rounded border-slate-300"
                          checked={allPendingSelected}
                          disabled={pendingManagerAckIds.length === 0}
                          onChange={toggleSelectAllPending}
                          aria-label={t('selectAllPending')}
                          title={t('selectAllPending')}
                        />
                      </th>
                    )}
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">{t('date')}</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap min-w-[10rem]">{t('employee')}</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">{t('expected')}</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">{t('worked')}</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">{t('late')}</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap" title={t('overtimeHint')}>
                      {t('overtime')} <span className="font-normal text-slate-400">({t('overtimeFull')})</span>
                    </th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">{t('absence')}</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">{t('status')}</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">{t('ack')}</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visibleDays.map(d => {
                    const name = empName(d.employeeId);
                    const canSelect = isManager && !locked && !d.managerAck;
                    return (
                      <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                        {isManager && !locked && (
                          <td className="px-3 py-2.5">
                            {canSelect ? (
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-primary rounded border-slate-300"
                                checked={selectedDayIds.includes(d.id)}
                                onChange={() => toggleSelectDay(d.id)}
                                aria-label={t('selectDay')}
                              />
                            ) : (
                              <span className="inline-block w-4" aria-hidden />
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap tabular-nums">{formatIsoDateBr(d.workDate)}</td>
                        <td className="px-3 py-2.5 text-slate-700 max-w-[12rem]">
                          <span className="block truncate" title={name}>{name}</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{fmtMinutes(d.expectedMinutes, t)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{fmtMinutes(d.workedMinutes, t)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-amber-800">
                          {d.lateMinutes ? fmtMinutes(d.lateMinutes, t) : '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-primary">
                          {d.overtimeMinutes ? fmtMinutes(d.overtimeMinutes, t) : '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                          {d.absenceMinutes ? (
                            <span className="inline-flex px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-medium">
                              {fmtMinutes(d.absenceMinutes, t)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="font-medium text-slate-800">{dayStatusLabel(d.status)}</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex flex-wrap gap-1">
                            {!d.employeeAck && (d.employeeId === user.id || d.employeeId === user.employeeId) && !locked && (
                              <button
                                type="button"
                                className="text-xs px-2 py-1 bg-slate-100 rounded-md hover:bg-slate-200"
                                onClick={() => hrService.acknowledgeTimesheetDay(d.id, 'employee').then(load)}
                              >
                                {t('employeeAck')}
                              </button>
                            )}
                            {d.employeeAck && <span className="text-emerald-700 text-xs font-semibold" title={t('employeeAck')}>E✓</span>}
                            {!d.managerAck && isManager && !locked && (
                              <button
                                type="button"
                                className="text-xs px-2 py-1 bg-slate-100 rounded-md hover:bg-slate-200"
                                onClick={() => hrService.acknowledgeTimesheetDay(d.id, 'manager').then(load)}
                              >
                                {t('managerAck')}
                              </button>
                            )}
                            {d.managerAck && <span className="text-emerald-700 text-xs font-semibold" title={t('managerAck')}>G✓</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {isHr && !locked && (
                            <button
                              type="button"
                              className="text-primary font-semibold text-sm hover:underline"
                              onClick={() => openAdjust(d)}
                            >
                              {t('adjust')}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Scale size={16} className="text-primary shrink-0" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-800">{t('hourBank')}</h3>
            </div>
            <p className="text-2xl font-semibold text-slate-900 tabular-nums">
              {fmtMinutes(bankBalance, t)}
            </p>
            <p className="text-xs text-slate-500 font-medium">{t('balance')}</p>

            {periodHours.dayCount > 0 && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t('periodHoursTitle')}
                </p>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 tabular-nums">{fmtMinutes(periodHours.expected, t)}</p>
                    <p className="text-[9px] text-slate-500 font-medium">{t('periodHoursExpected')}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-700 tabular-nums">{fmtMinutes(periodHours.worked, t)}</p>
                    <p className="text-[9px] text-slate-500 font-medium">{t('periodHoursWorked')}</p>
                  </div>
                  <div>
                    <p className={`text-sm font-semibold tabular-nums ${periodHours.remaining > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
                      {fmtMinutes(periodHours.remaining, t)}
                    </p>
                    <p className="text-[9px] text-slate-500 font-medium">{t('periodHoursRemaining')}</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">{t('periodHoursHint')}</p>
              </div>
            )}

            <ul className="max-h-48 overflow-y-auto space-y-2 text-xs">
              {bankEntries.slice(0, 20).map(e => (
                <li key={e.id} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                  <span className="text-slate-500 truncate">
                    {formatIsoDateBr(e.entryDate)} · {entryTypeLabel(e.entryType)}
                  </span>
                  <span className={`shrink-0 tabular-nums ${e.minutesDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {e.minutesDelta >= 0 ? '+' : ''}{fmtMinutes(e.minutesDelta, t)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{t('punchesTitle')}</h3>
              {isHr && !locked && (
                <button
                  type="button"
                  className="text-xs font-semibold text-primary shrink-0 hover:underline"
                  onClick={() => {
                    setPunchForm({
                      employeeId: employeeFilter !== 'ALL' ? employeeFilter : employees[0]?.id || '',
                      punchedAt: '',
                      direction: 'IN',
                    });
                    setShowManualPunch(true);
                  }}
                >
                  {t('addManualPunch')}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">{t('punchesHint')}</p>
            {visiblePunches.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">{t('noPunches')}</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto space-y-2 text-xs">
                {visiblePunches.slice(0, 50).map(p => (
                  <li key={p.id} className="flex flex-col border-b border-slate-100 pb-2 gap-0.5">
                    <span className="font-medium text-slate-800 tabular-nums">
                      {formatDateTime(p.punchedAt)}
                    </span>
                    <span className="text-slate-500 truncate" title={`${empName(p.employeeId)} · ${p.direction} · ${p.source}`}>
                      {empName(p.employeeId)} · {p.direction} · {p.source}
                      {p.nsr ? ` · NSR ${p.nsr}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {adjustDay && (
        <div className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="font-semibold text-slate-900">{t('adjust')} — {formatIsoDateBr(adjustDay.workDate)}</h3>
            <label className="block text-xs space-y-1">
              <span className="text-slate-400 uppercase font-semibold">{t('worked')}</span>
              <input type="number" className="w-full px-3 py-2 border rounded-xl" value={adjustForm.workedMinutes} onChange={e => setAdjustForm({ ...adjustForm, workedMinutes: Number(e.target.value) })} />
            </label>
            <label className="block text-xs space-y-1">
              <span className="text-slate-400 uppercase font-semibold">{t('overtime')}</span>
              <input type="number" className="w-full px-3 py-2 border rounded-xl" value={adjustForm.overtimeMinutes} onChange={e => setAdjustForm({ ...adjustForm, overtimeMinutes: Number(e.target.value) })} />
            </label>
            <label className="block text-xs space-y-1">
              <span className="text-slate-400 uppercase font-semibold">{t('late')}</span>
              <input type="number" className="w-full px-3 py-2 border rounded-xl" value={adjustForm.lateMinutes} onChange={e => setAdjustForm({ ...adjustForm, lateMinutes: Number(e.target.value) })} />
            </label>
            <label className="block text-xs space-y-1">
              <span className="text-slate-400 uppercase font-semibold">{t('remarks')}</span>
              <input className="w-full px-3 py-2 border rounded-xl" value={adjustForm.remarks} onChange={e => setAdjustForm({ ...adjustForm, remarks: e.target.value })} />
            </label>
            <div className="flex gap-2 pt-2">
              <button className="flex-1 py-3 bg-slate-100 rounded-xl text-xs font-semibold" onClick={() => setAdjustDay(null)}>{t('common:cancel')}</button>
              <button className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-semibold" onClick={saveAdjust}>{t('saveAdjust')}</button>
            </div>
          </div>
        </div>
      )}

      {showManualPunch && (
        <div className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="font-semibold">{t('addManualPunch')}</h3>
            <select className="w-full px-3 py-2 border rounded-xl text-sm" value={punchForm.employeeId} onChange={e => setPunchForm({ ...punchForm, employeeId: e.target.value })}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <input type="datetime-local" className="w-full px-3 py-2 border rounded-xl text-sm" value={punchForm.punchedAt} onChange={e => setPunchForm({ ...punchForm, punchedAt: e.target.value })} />
            <select className="w-full px-3 py-2 border rounded-xl text-sm" value={punchForm.direction} onChange={e => setPunchForm({ ...punchForm, direction: e.target.value as Punch['direction'] })}>
              {['IN', 'OUT', 'BREAK_START', 'BREAK_END', 'UNKNOWN'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="flex gap-2">
              <button className="flex-1 py-3 bg-slate-100 rounded-xl text-xs font-semibold" onClick={() => setShowManualPunch(false)}>{t('common:cancel')}</button>
              <button className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-semibold" onClick={saveManualPunch}>{t('addManualPunch')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Timesheet;
