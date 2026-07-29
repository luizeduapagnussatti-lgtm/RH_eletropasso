import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays, RefreshCw, Download, Lock, CheckCircle2, Scale, FileJson, Send, FileText,
} from 'lucide-react';
import { hrService } from '../services/hrService';
import {
  Employee, Holiday, LeaveRequest, Punch, Shift, TimesheetDay, TimesheetEmployeeReview, TimesheetPeriod, TimesheetPeriodStatus, User,
} from '../types';
import { useToast } from '../context/ToastContext';
import HelpButton from '../components/onboarding/HelpButton';
import { TimesheetMirrorGrid } from '../components/timesheet/TimesheetMirrorGrid';
import { TimesheetAdjustModal, type DayCalcContextProps } from '../components/timesheet/TimesheetAdjustModal';
import TimesheetReviewModal from '../components/timesheet/TimesheetReviewModal';
import TimesheetReviewSummaryPanel, { ReviewRow } from '../components/timesheet/TimesheetReviewSummaryPanel';
import { orgTabButtonClass } from '../components/organization/OrgUi';
import { formatDateTime, formatIsoDateBr, getDateLocale } from '../i18n/format';
import { competenceForDate, eachDateInRange, todayIsoLocal } from '../utils/payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../constants';
import { validateTimesheetEmployeeReview } from '../utils/timesheetReviewValidation';
import { PayrollPendenciesPanel } from '../components/payroll/PayrollPendenciesPanel';
import { isTimesheetExempt } from '../utils/roles';
import { localWorkDateTimeToIso, punchLocalDateKey } from '../services/punch.service';
import { resolveShiftDay } from '../services/timeCalculation.service';
import { displayAbsenceMinutes } from '../utils/timesheetDisplay';
import {
  buildPunchMapKey,
  canExportMirrorPdf,
  dayAckBlockI18nKey,
  isDayApprovable,
  TimesheetAckValidationError,
} from '../utils/timesheetDayAckValidation';
import { buildDayCoherenceContext } from '../utils/timesheetDayCoherence';

function punchesForTimesheetDay(day: TimesheetDay, all: Punch[]): Punch[] {
  return all.filter(
    p => punchLocalDateKey(p.punchedAt) === day.workDate && p.employeeId === day.employeeId
  );
}

interface Props {
  user: User;
  onNavigate?: (path: string, params?: any) => void;
}

type TimesheetViewMode = 'summary' | 'mirror';
type ReviewModalMode = 'submit' | 'approve' | 'lock';

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

const employeeReviewStatusKey: Record<string, string> = {
  OPEN: 'reviewStatus_OPEN',
  IN_REVIEW: 'reviewStatus_IN_REVIEW',
  EMPLOYEE_SIGNED: 'reviewStatus_EMPLOYEE_SIGNED',
  APPROVED: 'reviewStatus_APPROVED',
};

const dayStatusKey: Record<string, string> = {
  OK: 'dayStatus_OK',
  LATE: 'dayStatus_LATE',
  ABSENT: 'dayStatus_ABSENT',
  INCOMPLETE: 'dayStatus_INCOMPLETE',
  HOLIDAY: 'dayStatus_HOLIDAY',
  LEAVE: 'dayStatus_LEAVE',
  ADJUSTED: 'dayStatus_ADJUSTED',
  OFF: 'dayStatus_OFF',
};

const Timesheet: React.FC<Props> = ({ user, onNavigate }) => {
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
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  /** Managers/HR start with no employee selected — data loads only after Apply. */
  const [employeeFilter, setEmployeeFilter] = useState(
    isHr || isManager ? '' : user.id
  );
  const [hasQuery, setHasQuery] = useState(!(isHr || isManager));
  const [bankBalance, setBankBalance] = useState(0);
  const [bankEntries, setBankEntries] = useState<Awaited<ReturnType<typeof hrService.listHourBankEntries>>>([]);
  const [bankEnabled, setBankEnabled] = useState(true);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRecalc, setIsRecalc] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [adjustDay, setAdjustDay] = useState<TimesheetDay | null>(null);
  const [showManualPunch, setShowManualPunch] = useState(false);
  const [punchForm, setPunchForm] = useState({
    employeeId: '',
    punchedAt: '',
    direction: 'IN' as Punch['direction'],
  });
  const [selectedDayIds, setSelectedDayIds] = useState<string[]>([]);
  const [isBulkAck, setIsBulkAck] = useState(false);
  const [viewMode, setViewMode] = useState<TimesheetViewMode>('summary');
  const [employeeReviews, setEmployeeReviews] = useState<TimesheetEmployeeReview[]>([]);
  const [reviewModal, setReviewModal] = useState<ReviewModalMode | null>(null);
  const [lockReadiness, setLockReadiness] = useState<Awaited<
    ReturnType<typeof hrService.getTimesheetPeriodLockReadiness>
  > | null>(null);
  const [isReviewWorking, setIsReviewWorking] = useState(false);
  /** When filter is Todos: which employee the right rail (hour bank / punches) shows. */
  const [focusedEmployeeId, setFocusedEmployeeId] = useState<string | null>(null);
  const focusedEmployeeIdRef = useRef<string | null>(null);
  focusedEmployeeIdRef.current = focusedEmployeeId;

  const locked = period?.status === 'LOCKED';
  const mustPickEmployee = isHr || isManager;
  const isSingleEmployee = Boolean(employeeFilter && employeeFilter !== 'ALL');

  const clearResults = useCallback(() => {
    setDays([]);
    setPunches([]);
    setBankEntries([]);
    setBankBalance(0);
    setSelectedDayIds([]);
    setFocusedEmployeeId(null);
    setHasQuery(false);
  }, []);

  const load = useCallback(async (employeeOverride?: string) => {
    const activeEmployee = employeeOverride ?? employeeFilter;
    if (mustPickEmployee && !activeEmployee) {
      showToast(t('selectEmployeeToLoad'), 'warning');
      return;
    }
    setIsLoading(true);
    try {
      const [emps, p] = await Promise.all([
        hrService.getEmployees(),
        hrService.getOrCreateTimesheetPeriod(year, month),
      ]);
      // Show anyone who punches / must be identifiable in the mirror (includes HR).
      // Exclude only system/admin/diretoria accounts that never clock in.
      const staff = emps.filter(e => !isTimesheetExempt(e.role));
      setEmployees(staff);
      setPeriod(p);

      const empId =
        activeEmployee === 'ALL'
          ? undefined
          : staff.find(e => e.id === activeEmployee)?.employeeId ||
            activeEmployee;

      const list = await hrService.listTimesheetDays(p.id, empId);
      const filtered =
        activeEmployee === 'ALL'
          ? list
          : list.filter(d => {
              const emp = staff.find(e => e.id === activeEmployee || e.employeeId === activeEmployee);
              return (
                d.employeeId === activeEmployee ||
                d.employeeId === emp?.id ||
                d.employeeId === emp?.employeeId
              );
            });
      setDays(activeEmployee === 'ALL' ? list : filtered);

      const start = p.startDate;
      const end = p.endDate;

      if (activeEmployee === 'ALL') {
        // Org-wide punches; hour bank only for focused row (not the logged-in viewer).
        const punchList = await hrService.listPunches({
          startDate: start,
          endDate: end,
        });
        setPunches(punchList);

        const focusId = focusedEmployeeIdRef.current;
        if (focusId) {
          const focusEmp = staff.find(e => e.id === focusId || e.employeeId === focusId);
          const bankEmp = focusEmp?.employeeId || focusEmp?.id || focusId;
          const [bal, entries] = await Promise.all([
            hrService.getHourBankBalance(bankEmp),
            hrService.listHourBankEntries(bankEmp, start, end),
          ]);
          setBankBalance(bal);
          setBankEntries(entries);
        } else {
          setBankBalance(0);
          setBankEntries([]);
        }
      } else {
        const bankEmp =
          staff.find(e => e.id === activeEmployee)?.employeeId || activeEmployee;
        const [bal, entries, punchList] = await Promise.all([
          hrService.getHourBankBalance(bankEmp),
          hrService.listHourBankEntries(bankEmp, start, end),
          hrService.listPunches({
            employeeId: bankEmp,
            startDate: start,
            endDate: end,
          }),
        ]);
        setBankBalance(bal);
        setBankEntries(entries);
        setPunches(punchList);

        // Auto-recalc days that have clock punches but no espelho row yet (REP ingest).
        if (bankEmp && punchList.length > 0 && p.status !== 'LOCKED') {
          const dayByDate = new Map(filtered.map(d => [d.workDate, d]));
          const punchDates = [
            ...new Set(
              punchList.map(px => punchLocalDateKey(px.punchedAt)),
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
            const refFiltered = refreshed.filter(d => {
              const emp = staff.find(e => e.id === activeEmployee || e.employeeId === activeEmployee);
              return (
                d.employeeId === activeEmployee ||
                d.employeeId === emp?.id ||
                d.employeeId === emp?.employeeId
              );
            });
            setDays(refFiltered);
          }
        }
      }

      const reviews = await hrService.listTimesheetEmployeeReviews(p.id);
      setEmployeeReviews(reviews);

      setHasQuery(true);
    } catch (e: any) {
      console.error(e);
      const detail = e instanceof Error && e.message ? e.message : '';
      showToast(detail && detail.length < 120 ? `${t('loadFailed')} ${detail}` : t('loadFailed'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [year, month, employeeFilter, mustPickEmployee, showToast, t]);

  /** Bootstrap employee list + period shell (no timesheet rows). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsBootstrapping(true);
      try {
        const [emps, p, shiftList, holidayList, leaveList] = await Promise.all([
          hrService.getEmployees(),
          hrService.getOrCreateTimesheetPeriod(year, month),
          hrService.getShifts(),
          hrService.getHolidays().catch(() => [] as Holiday[]),
          hrService.getLeaves().catch(() => [] as LeaveRequest[]),
        ]);
        if (cancelled) return;
        setEmployees(emps.filter(e => !isTimesheetExempt(e.role)));
        setPeriod(p);
        setShifts(shiftList);
        setHolidays(holidayList);
        setLeaves(leaveList);
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

  useEffect(() => {
    let alive = true;
    void hrService.getConfig()
      .then(cfg => { if (alive) setBankEnabled(cfg?.ptrpPolicy?.bankEnabled ?? true); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const filtersPrimed = useRef(false);
  const skipNextFilterClear = useRef(false);
  useEffect(() => {
    setDayFilter('ALL');
    setSelectedDayIds([]);
    if (!filtersPrimed.current) {
      filtersPrimed.current = true;
      return;
    }
    if (skipNextFilterClear.current) {
      skipNextFilterClear.current = false;
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
    const base = dayFilter === 'ALL' ? elapsedDays : elapsedDays.filter(d => d.workDate === dayFilter);
    if (employeeFilter !== 'ALL') return base;
    const nameOf = (id: string) => {
      const e = employees.find(x => x.id === id || x.employeeId === id);
      return e?.name || id;
    };
    return [...base].sort((a, b) => {
      const byDate = a.workDate.localeCompare(b.workDate);
      if (byDate !== 0) return byDate;
      return nameOf(a.employeeId).localeCompare(nameOf(b.employeeId), 'pt-BR');
    });
  }, [elapsedDays, dayFilter, employeeFilter, employees]);

  /** Employee key driving the hour-bank / period-hours rail. */
  const railEmployeeKey = useMemo(() => {
    if (employeeFilter === 'ALL') {
      if (!focusedEmployeeId) return null;
      const emp = employees.find(e => e.id === focusedEmployeeId || e.employeeId === focusedEmployeeId);
      return emp?.employeeId || emp?.id || focusedEmployeeId;
    }
    if (!employeeFilter) return null;
    const emp = employees.find(e => e.id === employeeFilter || e.employeeId === employeeFilter);
    return emp?.employeeId || emp?.id || employeeFilter;
  }, [employeeFilter, focusedEmployeeId, employees]);

  const railEmployeeName = useMemo(() => {
    if (employeeFilter === 'ALL') {
      if (!focusedEmployeeId) return '';
      const emp = employees.find(e => e.id === focusedEmployeeId || e.employeeId === focusedEmployeeId);
      return emp?.name || focusedEmployeeId;
    }
    const emp = employees.find(e => e.id === employeeFilter || e.employeeId === employeeFilter);
    return emp?.name || '';
  }, [employeeFilter, focusedEmployeeId, employees]);

  /** Hours target for the same employee shown in the hour-bank panel. */
  const periodHours = useMemo(() => {
    if (!railEmployeeKey) {
      return { expected: 0, worked: 0, remaining: 0, dayCount: 0, expectedFull: 0 };
    }
    const today = todayIsoLocal();
    const emp = employees.find(
      e => e.id === railEmployeeKey || e.employeeId === railEmployeeKey || e.id === focusedEmployeeId || e.employeeId === focusedEmployeeId
    );
    const belongsToEmp = (d: TimesheetDay) =>
      d.employeeId === railEmployeeKey ||
      d.employeeId === emp?.id ||
      d.employeeId === emp?.employeeId;
    // Full-period target ("Meta prevista"): every day in the period, matching the PDF.
    const expectedFull = days
      .filter(belongsToEmp)
      .reduce((s, d) => s + (d.expectedMinutes || 0), 0);
    // Progress so far ("Jornada até hoje"): only elapsed days.
    const scope = days.filter(d => d.workDate <= today && belongsToEmp(d));
    const expected = scope.reduce((s, d) => s + (d.expectedMinutes || 0), 0);
    const worked = scope.reduce((s, d) => s + (d.workedMinutes || 0), 0);
    const remaining = Math.max(0, expected - worked);
    return { expected, worked, remaining, dayCount: scope.length, expectedFull };
  }, [days, railEmployeeKey, employees, focusedEmployeeId]);

  /** When Todos + row focus: fetch hour bank for that employee only. */
  useEffect(() => {
    if (!hasQuery || !period || employeeFilter !== 'ALL') return;
    if (!focusedEmployeeId) {
      setBankBalance(0);
      setBankEntries([]);
      return;
    }
    let cancelled = false;
    const emp = employees.find(e => e.id === focusedEmployeeId || e.employeeId === focusedEmployeeId);
    const bankEmp = emp?.employeeId || emp?.id || focusedEmployeeId;
    void (async () => {
      try {
        const [bal, entries] = await Promise.all([
          hrService.getHourBankBalance(bankEmp),
          hrService.listHourBankEntries(bankEmp, period.startDate, period.endDate),
        ]);
        if (!cancelled) {
          setBankBalance(bal);
          setBankEntries(entries);
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusedEmployeeId, employeeFilter, hasQuery, period, employees]);

  useEffect(() => {
    if (dayFilter !== 'ALL' && dayFilter > todayIsoLocal()) {
      setDayFilter('ALL');
    }
  }, [dayFilter, period?.endDate]);

  const coherenceCtxByEmpDate = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildDayCoherenceContext>>();
    for (const day of days) {
      const emp = employees.find(
        e => e.id === day.employeeId || e.employeeId === day.employeeId,
      );
      const shift =
        shifts.find(s => s.id === day.shiftId) ||
        shifts.find(s => s.id === emp?.shiftId) ||
        null;
      map.set(
        buildPunchMapKey(day.employeeId, day.workDate),
        buildDayCoherenceContext(day, { shift, holidays, leaves, employee: emp }),
      );
    }
    return map;
  }, [days, employees, shifts, holidays, leaves]);

  const coherenceCtxForDay = useCallback(
    (day: TimesheetDay) => coherenceCtxByEmpDate.get(buildPunchMapKey(day.employeeId, day.workDate)),
    [coherenceCtxByEmpDate],
  );

  const pendingManagerAckIds = useMemo(() => {
    if (!isManager || locked) return [] as string[];
    return visibleDays.filter(d => !d.managerAck).map(d => d.id);
  }, [visibleDays, isManager, locked]);

  const approvablePendingIds = useMemo(() => {
    if (!isManager || locked) return [] as string[];
    return visibleDays
      .filter(d => {
        if (d.managerAck) return false;
        return isDayApprovable(
          d,
          punchesForTimesheetDay(d, punches),
          coherenceCtxForDay(d),
        ).ok;
      })
      .map(d => d.id);
  }, [visibleDays, isManager, locked, punches, coherenceCtxForDay]);

  const approvedVisibleIds = useMemo(() => {
    if (!isManager || locked) return [] as string[];
    return visibleDays.filter(d => d.managerAck).map(d => d.id);
  }, [visibleDays, isManager, locked]);

  const selectableDayIds = useMemo(() => {
    if (!isManager || locked) return [] as string[];
    return visibleDays.map(d => d.id);
  }, [visibleDays, isManager, locked]);

  const allVisibleSelected =
    selectableDayIds.length > 0 &&
    selectableDayIds.every(id => selectedDayIds.includes(id));

  const toastAckError = useCallback(
    (e: unknown) => {
      if (e instanceof TimesheetAckValidationError && e.blocked[0]) {
        const reason = e.blocked[0].reason;
        showToast(t(dayAckBlockI18nKey(reason)), 'warning');
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'ack_validation_failed') {
        showToast(t('ackBlockedUnknown'), 'warning');
        return;
      }
      showToast(msg || t('bulkManagerAckFailed'), 'error');
    },
    [showToast, t]
  );

  const toggleSelectDay = (id: string) => {
    setSelectedDayIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedDayIds(prev => prev.filter(id => !selectableDayIds.includes(id)));
    } else {
      setSelectedDayIds(prev => [...new Set([...prev, ...selectableDayIds])]);
    }
  };

  const handleBulkManagerAck = async (ids: string[]) => {
    if (locked || ids.length === 0) return;
    const byId = new Map(visibleDays.map(d => [d.id, d]));
    const eligible = ids.filter(id => {
      const day = byId.get(id);
      return day && !day.managerAck && isDayApprovable(
        day,
        punchesForTimesheetDay(day, punches),
        coherenceCtxForDay(day),
      ).ok;
    });
    const skipped = ids.length - eligible.length;
    if (eligible.length === 0) {
      showToast(t('bulkManagerAckPartial', { count: 0, skipped }), 'warning');
      return;
    }
    setIsBulkAck(true);
    try {
      const count = await hrService.acknowledgeTimesheetDays(eligible, 'manager', true);
      if (skipped > 0) {
        showToast(t('bulkManagerAckPartial', { count, skipped }), 'warning');
      } else {
        showToast(t('bulkManagerAckOk', { count }), 'success');
      }
      setSelectedDayIds([]);
      await load();
    } catch (e: unknown) {
      toastAckError(e);
    } finally {
      setIsBulkAck(false);
    }
  };

  const handleBulkManagerRevoke = async (ids: string[]) => {
    if (locked || ids.length === 0) return;
    const byId = new Map(visibleDays.map(d => [d.id, d]));
    const eligible = ids.filter(id => byId.get(id)?.managerAck);
    if (eligible.length === 0) return;
    setIsBulkAck(true);
    try {
      const count = await hrService.acknowledgeTimesheetDays(eligible, 'manager', false);
      showToast(t('bulkManagerRevokeOk', { count }), 'success');
      setSelectedDayIds([]);
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('bulkManagerRevokeFailed'), 'error');
    } finally {
      setIsBulkAck(false);
    }
  };

  const handleManagerAckDay = async (
    dayId: string,
    acked: boolean,
    dayOverride?: TimesheetDay
  ) => {
    if (locked) return;
    if (acked) {
      const day =
        dayOverride ||
        days.find(d => d.id === dayId) ||
        visibleDays.find(d => d.id === dayId);
      if (day) {
        const v = isDayApprovable(
          day,
          punchesForTimesheetDay(day, punches),
          coherenceCtxForDay(day),
        );
        if (!v.ok) {
          showToast(t(dayAckBlockI18nKey(v.reason || 'unknown')), 'warning');
          return;
        }
      }
    }
    try {
      await hrService.acknowledgeTimesheetDay(dayId, 'manager', acked);
      showToast(acked ? t('managerAckOk') : t('revokeManagerAckOk'), 'success');
      await load();
    } catch (e: unknown) {
      toastAckError(e);
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
    let list = punches;
    if (dayFilter !== 'ALL') {
      list = list.filter(p => p.punchedAt.slice(0, 10) === dayFilter);
    }
    if (employeeFilter === 'ALL') {
      if (!focusedEmployeeId) return [];
      const emp = employees.find(e => e.id === focusedEmployeeId || e.employeeId === focusedEmployeeId);
      const keys = new Set(
        [focusedEmployeeId, emp?.id, emp?.employeeId].filter(Boolean) as string[],
      );
      list = list.filter(p => keys.has(p.employeeId));
    }
    return list;
  }, [punches, dayFilter, employeeFilter, focusedEmployeeId, employees]);

  const matchesFocusedEmployee = useCallback(
    (dayEmpId: string) => {
      if (!focusedEmployeeId) return false;
      if (dayEmpId === focusedEmployeeId) return true;
      const emp = employees.find(e => e.id === focusedEmployeeId || e.employeeId === focusedEmployeeId);
      if (!emp) return false;
      return dayEmpId === emp.id || dayEmpId === emp.employeeId;
    },
    [focusedEmployeeId, employees],
  );

  const focusEmployeeFromDay = useCallback(
    (dayEmpId: string) => {
      const emp = employees.find(e => e.id === dayEmpId || e.employeeId === dayEmpId);
      setFocusedEmployeeId(emp?.id || dayEmpId);
    },
    [employees],
  );

  const tableColSpan = isManager && !locked ? 11 : 10;
  const showDaySeparators = employeeFilter === 'ALL' && hasQuery;
  const railNeedsSelection = employeeFilter === 'ALL' && !focusedEmployeeId;
  const railReady = Boolean(railEmployeeKey);

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
    return (id: string) => map.get(id) || t('unknownEmployee', { id });
  }, [employees, t]);

  const selectedEmployee = useMemo(
    () => employees.find(e => e.id === employeeFilter),
    [employees, employeeFilter]
  );

  const currentEmployeeReview = useMemo(() => {
    if (!selectedEmployee || employeeFilter === 'ALL') return null;
    const punchKey = selectedEmployee.employeeId || selectedEmployee.id;
    return (
      employeeReviews.find(r => r.employeeId === punchKey) ||
      employeeReviews.find(r => r.profileId === selectedEmployee.id) ||
      employeeReviews.find(r => r.employeeId === selectedEmployee.id) ||
      null
    );
  }, [employeeReviews, selectedEmployee, employeeFilter]);

  const employeeReviewValidation = useMemo(
    () => validateTimesheetEmployeeReview(elapsedDays, todayIsoLocal(), punches),
    [elapsedDays, punches]
  );

  const canApproveSelectedEmployee = useMemo(() => {
    if (!selectedEmployee || locked) return false;
    if (currentEmployeeReview?.status === 'APPROVED') return false;
    if (currentEmployeeReview?.status !== 'EMPLOYEE_SIGNED') return false;
    if (!employeeReviewValidation.canApprove) return false;
    if (isHr) return true;
    return isManager && selectedEmployee.lineManagerId === user.id;
  }, [selectedEmployee, currentEmployeeReview, locked, employeeReviewValidation.canApprove, isHr, isManager, user.id]);

  const reviewSummaryRows = useMemo((): ReviewRow[] => {
    if (employeeFilter !== 'ALL' || !hasQuery) return [];
    const today = todayIsoLocal();
    const reviewByKey = new Map<string, TimesheetEmployeeReview>();
    for (const r of employeeReviews) {
      reviewByKey.set(r.employeeId, r);
      if (r.profileId) reviewByKey.set(r.profileId, r);
    }
    return employees.map(employee => {
      const punchKey = employee.employeeId || employee.id;
      const review =
        reviewByKey.get(punchKey) ||
        reviewByKey.get(employee.id) ||
        null;
      const employeeDays = days.filter(d => {
        if (d.workDate > today) return false;
        return (
          d.employeeId === punchKey ||
          d.employeeId === employee.id ||
          d.employeeId === employee.employeeId
        );
      });
      return {
        employee,
        review,
        employeeDays,
        pendingManagerAck: employeeDays.filter(d => !d.managerAck).length,
      };
    });
  }, [employeeFilter, hasQuery, employeeReviews, employees, days]);

  const openReviewModal = async (mode: ReviewModalMode) => {
    if (mode === 'lock') {
      if (!period) return;
      try {
        const readiness = await hrService.getTimesheetPeriodLockReadiness(period.id);
        setLockReadiness(readiness);
        setReviewModal('lock');
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : '';
        const message =
          raw === 'reviewLockNotReady'
            ? t('reviewLockNotReady')
            : /is not defined|TypeError:/i.test(raw)
              ? t('loadFailed')
              : raw || t('loadFailed');
        showToast(message, 'error');
      }
      return;
    }
    if (!isSingleEmployee) {
      showToast(t('reviewSelectEmployeeFirst'), 'warning');
      return;
    }
    setReviewModal(mode);
  };

  const confirmReviewModal = async () => {
    if (!period || !reviewModal) return;
    setIsReviewWorking(true);
    try {
      if (reviewModal === 'submit') {
        if (!employeeFilter || employeeFilter === 'ALL') return;
        await hrService.submitTimesheetEmployeeReview(period.id, employeeFilter, user.id);
        showToast(t('reviewSubmitOk'), 'success');
      } else if (reviewModal === 'approve') {
        if (!employeeFilter || employeeFilter === 'ALL') return;
        await hrService.approveTimesheetEmployeeReview(period.id, employeeFilter, user.id);
        showToast(t('reviewApproveOk'), 'success');
      } else if (reviewModal === 'lock') {
        const force = !(lockReadiness?.canLock);
        await hrService.lockTimesheetPeriod(period.id, user.id, force);
        showToast(t('reviewLockOk'), 'success');
      }
      setReviewModal(null);
      setLockReadiness(null);
      await load();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : t('loadFailed');
      const msg = raw.startsWith('review') ? t(raw) : raw;
      showToast(msg, 'error');
    } finally {
      setIsReviewWorking(false);
    }
  };

  const handleRecalc = async () => {
    if (locked) return;
    setIsRecalc(true);
    try {
      const ids =
        employeeFilter === 'ALL'
          ? undefined
          : [employeeFilter];
      const result = await hrService.recalculateTimesheetPeriod(year, month, ids);
      if (result.failed > 0) {
        showToast(t('recalcPartial', { count: result.count, failed: result.failed }), 'warning');
      } else {
        showToast(t('recalcOk', { count: result.count }), 'success');
      }
      await load();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : '';
      const message =
        raw === 'Period is locked'
          ? t('periodLocked', { defaultValue: t('recalcFailed') })
          : /is not defined|TypeError:/i.test(raw)
            ? t('recalcFailed')
            : raw || t('recalcFailed');
      showToast(message, 'error');
    } finally {
      setIsRecalc(false);
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

  const handleExportMirrorPdf = async () => {
    if (!period || !hasQuery) return;
    if (days.length === 0) {
      showToast(t('mirrorPdfNoDays'), 'warning');
      return;
    }
    const pdfGate = canExportMirrorPdf(days);
    if (!pdfGate.ok) {
      showToast(t('mirrorPdfRequiresAllApproved', { pending: pdfGate.pendingCount }), 'warning');
      return;
    }
    setIsExportingPdf(true);
    try {
      const labels = {
        title: t('pdf.title'),
        periodRange: t('pdf.periodRange'),
        employeeSection: t('pdf.employeeSection'),
        name: t('pdf.name'),
        employeeId: t('pdf.employeeId'),
        cpf: t('pdf.cpf'),
        department: t('pdf.department'),
        designation: t('pdf.designation'),
        reviewStatus: t('pdf.reviewStatus'),
        reviewApproved: t('pdf.reviewApproved'),
        reviewPending: t('pdf.reviewPending'),
        reviewPartial: t('pdf.reviewPartial'),
        managerAckSummary: t('pdf.managerAckSummary'),
        metricsSection: t('pdf.metricsSection'),
        periodStatus: t('pdf.periodStatus'),
        colDay: t('pdf.colDay'),
        colEntry1: t('pdf.colEntry1'),
        colExit1: t('pdf.colExit1'),
        colEntry2: t('pdf.colEntry2'),
        colExit2: t('pdf.colExit2'),
        colWorked: t('pdf.colWorked'),
        colOvertime: t('pdf.colOvertime'),
        colLate: t('pdf.colLate'),
        colAbsence: t('pdf.colAbsence'),
        colStatus: t('pdf.colStatus'),
        colEmployee: t('pdf.colEmployee'),
        metricExpected: t('pdf.metricExpected'),
        metricWorked: t('pdf.metricWorked'),
        metricOvertime: t('pdf.metricOvertime'),
        metricLate: t('pdf.metricLate'),
        metricAbsence: t('pdf.metricAbsence'),
        summarySection: t('pdf.summarySection'),
        generatedBy: t('pdf.generatedBy'),
        page: t('pdf.page'),
        notAvailable: t('pdf.notAvailable'),
        notesSection: t('pdf.notesSection'),
        extraPunchesLine: t('pdf.extraPunchesLine'),
        remarksLine: t('pdf.remarksLine'),
        signatureEmployee: t('pdf.signatureEmployee'),
        signatureManager: t('pdf.signatureManager'),
        totalsRow: t('pdf.totalsRow'),
      };
      const { blob, filename } = await hrService.exportTimesheetMirrorPdf({
        period,
        employeeFilter,
        employees,
        days,
        punches,
        reviews: employeeReviews,
        labels,
        dayStatusLabel,
        reviewStatusLabel: (code: string) => {
          const key = employeeReviewStatusKey[code];
          return key ? t(key) : t('pdf.reviewPending');
        },
        periodStatusLabel: (code: string) => {
          const key = statusLabelKey[code as TimesheetPeriodStatus];
          return key ? t(key) : code;
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('exportOk'), 'success');
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      if (raw === 'employee_not_found') {
        showToast(t('mirrorPdfEmployeeRequired'), 'warning');
      } else if (raw === 'employee_no_days') {
        showToast(t('mirrorPdfNoDays'), 'warning');
      } else if (raw === 'mirror_pdf_requires_all_approved') {
        const gate = canExportMirrorPdf(days);
        showToast(t('mirrorPdfRequiresAllApproved', { pending: gate.pendingCount }), 'warning');
      } else {
        showToast(raw || t('loadFailed'), 'error');
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrePayrollExport = async () => {
    if (!period) return;
    try {
      if (!['APPROVED', 'LOCKED'].includes(period.status)) {
        showToast(t('prePayrollPeriodRequired'), 'warning');
        return;
      }
      await hrService.buildPayrollConsolidation(period.id);
      const data = await hrService.buildPayrollExportV1(period.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pre-folha_${year}_${String(month).padStart(2, '0')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('exportOk'), 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('loadFailed'), 'error');
    }
  };

  const openAdjust = (day: TimesheetDay) => {
    setAdjustDay(day);
  };

  const saveJustification = async (remarks: string) => {
    if (!adjustDay || locked) return;
    try {
      const wasAcked = adjustDay.managerAck;
      await hrService.updateTimesheetDayJustification(adjustDay.id, remarks);
      setAdjustDay(null);
      showToast(wasAcked ? t('adjustSavedNeedsReack') : t('justificationSaved'), 'success');
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('loadFailed');
      throw new Error(message);
    }
  };

  const addPunchFromModal = async (input: { time: string; direction: Punch['direction']; remarks?: string }) => {
    if (!adjustDay || locked) throw new Error(t('lockedHint'));
    const emp = employees.find(
      e => e.id === adjustDay.employeeId || e.employeeId === adjustDay.employeeId
    );
    const punchEmployeeId = emp?.employeeId || adjustDay.employeeId;
    const punchedAt = localWorkDateTimeToIso(adjustDay.workDate, input.time);

    // Same minute already exists?
    const dup = punches.some(p => {
      if (punchLocalDateKey(p.punchedAt) !== adjustDay.workDate) return false;
      if (
        p.employeeId !== punchEmployeeId &&
        p.employeeId !== adjustDay.employeeId &&
        p.employeeId !== emp?.id
      ) {
        return false;
      }
      const d = new Date(p.punchedAt);
      const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return hhmm === input.time;
    });
    if (dup) throw new Error(t('adjustPunchDuplicate'));

    if (adjustDay.managerAck) {
      await hrService.acknowledgeTimesheetDay(adjustDay.id, 'manager', false);
    }

    const created = await hrService.createManualPunch({
      employeeId: punchEmployeeId,
      punchedAt,
      direction: input.direction,
      remarks: input.remarks,
    });
    setPunches(prev => [...prev, created].sort((a, b) => a.punchedAt.localeCompare(b.punchedAt)));

    const recalcKey = emp?.id || adjustDay.employeeId;
    const recalculated = await hrService.recalculateTimesheetDay(recalcKey, adjustDay.workDate, period || undefined);
    await hrService.acknowledgeTimesheetDay(recalculated.id, 'manager', false);
    setAdjustDay({ ...recalculated, managerAck: false });
    setDays(prev =>
      prev.map(d =>
        d.id === recalculated.id ||
        (d.workDate === recalculated.workDate && d.employeeId === recalculated.employeeId)
          ? { ...recalculated, managerAck: false }
          : d
      )
    );
    showToast(t('adjustPunchAddedRecalc'), 'success');
    await load();
    await offerApproveDayAfterRecalc(recalculated.id, recalculated);
  };

  const deletePunchFromModal = async (punchId: string) => {
    if (!adjustDay || locked) throw new Error(t('lockedHint'));
    if (adjustDay.managerAck) {
      await hrService.acknowledgeTimesheetDay(adjustDay.id, 'manager', false);
    }
    await hrService.deletePunch(punchId);
    setPunches(prev => prev.filter(p => p.id !== punchId));
    const emp = employees.find(
      e => e.id === adjustDay.employeeId || e.employeeId === adjustDay.employeeId
    );
    const recalcKey = emp?.id || adjustDay.employeeId;
    const recalculated = await hrService.recalculateTimesheetDay(recalcKey, adjustDay.workDate, period || undefined);
    await hrService.acknowledgeTimesheetDay(recalculated.id, 'manager', false);
    setAdjustDay({ ...recalculated, managerAck: false });
    setDays(prev =>
      prev.map(d =>
        d.id === recalculated.id ||
        (d.workDate === recalculated.workDate && d.employeeId === recalculated.employeeId)
          ? { ...recalculated, managerAck: false }
          : d
      )
    );
    showToast(t('adjustPunchDeletedRecalc'), 'success');
    await load();
  };

  const setPunchIgnoredFromModal = async (punchId: string, ignored: boolean) => {
    if (!adjustDay || locked) throw new Error(t('lockedHint'));
    if (adjustDay.managerAck) {
      await hrService.acknowledgeTimesheetDay(adjustDay.id, 'manager', false);
    }
    const updated = await hrService.setPunchIgnoredForCalc(punchId, ignored);
    setPunches(prev => prev.map(p => (p.id === punchId ? updated : p)));
    const emp = employees.find(
      e => e.id === adjustDay.employeeId || e.employeeId === adjustDay.employeeId
    );
    const recalcKey = emp?.id || adjustDay.employeeId;
    const recalculated = await hrService.recalculateTimesheetDay(recalcKey, adjustDay.workDate, period || undefined);
    await hrService.acknowledgeTimesheetDay(recalculated.id, 'manager', false);
    setAdjustDay({ ...recalculated, managerAck: false });
    setDays(prev =>
      prev.map(d =>
        d.id === recalculated.id ||
        (d.workDate === recalculated.workDate && d.employeeId === recalculated.employeeId)
          ? { ...recalculated, managerAck: false }
          : d
      )
    );
    showToast(ignored ? t('adjustPunchIgnoredRecalc') : t('adjustPunchConsideredRecalc'), 'success');
    await load();
  };

  const updatePunchFromModal = async (
    punchId: string,
    input: { punchedAtTime: string; direction: Punch['direction'] },
  ) => {
    if (!adjustDay || locked) throw new Error(t('lockedHint'));
    const emp = employees.find(
      e => e.id === adjustDay.employeeId || e.employeeId === adjustDay.employeeId,
    );
    const punchedAt = localWorkDateTimeToIso(adjustDay.workDate, input.punchedAtTime);
    if (adjustDay.managerAck) {
      await hrService.acknowledgeTimesheetDay(adjustDay.id, 'manager', false);
    }
    const updated = await hrService.updateManualPunch(punchId, {
      punchedAt,
      direction: input.direction,
    });
    setPunches(prev =>
      prev
        .map(p => (p.id === punchId ? updated : p))
        .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt)),
    );
    const recalcKey = emp?.id || adjustDay.employeeId;
    const recalculated = await hrService.recalculateTimesheetDay(
      recalcKey,
      adjustDay.workDate,
      period || undefined,
    );
    await hrService.acknowledgeTimesheetDay(recalculated.id, 'manager', false);
    setAdjustDay({ ...recalculated, managerAck: false });
    setDays(prev =>
      prev.map(d =>
        d.id === recalculated.id ||
        (d.workDate === recalculated.workDate && d.employeeId === recalculated.employeeId)
          ? { ...recalculated, managerAck: false }
          : d,
      ),
    );
    showToast(t('adjustPunchUpdatedRecalc'), 'success');
    await load();
  };

  const applyFixedBreakFromModal = async () => {
    if (!adjustDay || locked) throw new Error(t('lockedHint'));
    const emp = employees.find(
      e => e.id === adjustDay.employeeId || e.employeeId === adjustDay.employeeId,
    );
    const shift =
      shifts.find(s => s.id === adjustDay.shiftId) ||
      shifts.find(s => s.id === emp?.shiftId) ||
      null;
    const daySched = resolveShiftDay(shift, adjustDay.workDate);
    if (
      daySched.breakFlexible ||
      !daySched.breakEarliestStart ||
      !daySched.breakLatestEnd
    ) {
      throw new Error(t('adjustFixedBreakUnavailable'));
    }

    const punchEmployeeId = emp?.employeeId || adjustDay.employeeId;
    const dayPunches = punches.filter(p => {
      if (punchLocalDateKey(p.punchedAt) !== adjustDay.workDate) return false;
      return (
        p.employeeId === punchEmployeeId ||
        p.employeeId === adjustDay.employeeId ||
        p.employeeId === emp?.id
      );
    });

    const hasManualBreak = dayPunches.some(
      p =>
        (p.direction === 'BREAK_START' || p.direction === 'BREAK_END') &&
        p.source === 'MANUAL',
    );
    let replaceManual = false;
    if (hasManualBreak) {
      if (!window.confirm(t('adjustApplyFixedBreakReplaceConfirm'))) return;
      replaceManual = true;
    }

    if (adjustDay.managerAck) {
      await hrService.acknowledgeTimesheetDay(adjustDay.id, 'manager', false);
    }

    try {
      const created = await hrService.applyFixedBreakPunches({
        employeeId: punchEmployeeId,
        workDate: adjustDay.workDate,
        breakStartHm: daySched.breakEarliestStart,
        breakEndHm: daySched.breakLatestEnd,
        existingPunches: dayPunches,
        replaceManual,
      });
      setPunches(prev =>
        [...prev.filter(p => !dayPunches.some(d => d.id === p.id && (d.direction === 'BREAK_START' || d.direction === 'BREAK_END') && d.source === 'MANUAL')), ...created]
          .sort((a, b) => a.punchedAt.localeCompare(b.punchedAt)),
      );
    } catch (e: unknown) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'CLOCK_BREAK_EXISTS') throw new Error(t('adjustApplyFixedBreakBlockedClock'));
      if (code === 'MANUAL_BREAK_EXISTS') throw new Error(t('adjustApplyFixedBreakReplaceConfirm'));
      throw e;
    }

    const recalcKey = emp?.id || adjustDay.employeeId;
    const recalculated = await hrService.recalculateTimesheetDay(
      recalcKey,
      adjustDay.workDate,
      period || undefined,
    );
    await hrService.acknowledgeTimesheetDay(recalculated.id, 'manager', false);
    setAdjustDay({ ...recalculated, managerAck: false });
    setDays(prev =>
      prev.map(d =>
        d.id === recalculated.id ||
        (d.workDate === recalculated.workDate && d.employeeId === recalculated.employeeId)
          ? { ...recalculated, managerAck: false }
          : d,
      ),
    );
    showToast(t('adjustFixedBreakApplied'), 'success');
    await load();
  };

  const adjustDayPunches = useMemo(() => {
    if (!adjustDay) return [] as Punch[];
    const date = adjustDay.workDate;
    const emp = employees.find(e => e.id === adjustDay.employeeId || e.employeeId === adjustDay.employeeId);
    return punches.filter(p => {
      if (punchLocalDateKey(p.punchedAt) !== date) return false;
      return (
        p.employeeId === adjustDay.employeeId ||
        p.employeeId === emp?.employeeId ||
        p.employeeId === emp?.id
      );
    });
  }, [adjustDay, punches, employees]);

  const adjustDayCalcContext = useMemo((): DayCalcContextProps | null => {
    if (!adjustDay) return null;
    const emp = employees.find(
      e => e.id === adjustDay.employeeId || e.employeeId === adjustDay.employeeId,
    );
    const shift =
      shifts.find(s => s.id === adjustDay.shiftId) ||
      shifts.find(s => s.id === emp?.shiftId) ||
      null;
    const ctx = buildDayCoherenceContext(adjustDay, {
      shift,
      holidays,
      leaves,
      employee: emp,
    });
    return {
      shift: ctx.shift,
      isHoliday: ctx.isHoliday,
      onApprovedLeave: ctx.onApprovedLeave,
      leaveRequestId: ctx.leaveRequestId,
      rosterStatus: ctx.rosterStatus,
      joiningDate: ctx.joiningDate,
      terminationDate: ctx.terminationDate,
    };
  }, [adjustDay, employees, shifts, holidays, leaves]);

  const adjustFixedBreak = useMemo(() => {
    if (!adjustDay) return null;
    const emp = employees.find(
      e => e.id === adjustDay.employeeId || e.employeeId === adjustDay.employeeId,
    );
    const shift =
      shifts.find(s => s.id === adjustDay.shiftId) ||
      shifts.find(s => s.id === emp?.shiftId) ||
      null;
    const daySched = resolveShiftDay(shift, adjustDay.workDate);
    if (
      daySched.breakFlexible ||
      !daySched.breakEarliestStart ||
      !daySched.breakLatestEnd
    ) {
      return null;
    }
    return { start: daySched.breakEarliestStart, end: daySched.breakLatestEnd };
  }, [adjustDay, employees, shifts]);

  const offerApproveDayAfterRecalc = async (dayId: string, day?: TimesheetDay) => {
    if (!window.confirm(t('offerApproveDayAfterRecalc'))) return;
    await handleManagerAckDay(dayId, true, day);
  };

  const saveManualPunch = async () => {
    if (!punchForm.employeeId || !punchForm.punchedAt) return;
    try {
      const emp = employees.find(e => e.id === punchForm.employeeId);
      const punchEmployeeId = emp?.employeeId || punchForm.employeeId;
      const punchedAtIso = new Date(punchForm.punchedAt).toISOString();
      await hrService.createManualPunch({
        employeeId: punchEmployeeId,
        punchedAt: punchedAtIso,
        direction: punchForm.direction,
      });
      const workDate = punchLocalDateKey(punchedAtIso);
      const recalculated = await hrService.recalculateTimesheetDay(
        emp?.id || punchForm.employeeId,
        workDate,
        period || undefined,
      );
      showToast(t('punchSavedRecalc'), 'success');
      setShowManualPunch(false);
      await load();
      await offerApproveDayAfterRecalc(recalculated.id, recalculated);
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
          {period &&
            selectedEmployee &&
            selectedEmployee.joiningDate &&
            selectedEmployee.joiningDate > period.startDate &&
            selectedEmployee.joiningDate <= period.endDate && (
              <p className="text-xs font-medium text-amber-950 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2 inline-block">
                {t('midPeriodHireHint', {
                  name: selectedEmployee.name,
                  date: selectedEmployee.joiningDate,
                })}
              </p>
            )}
          {period &&
            selectedEmployee?.terminationDate &&
            selectedEmployee.terminationDate >= period.startDate &&
            selectedEmployee.terminationDate < period.endDate && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5 mt-2 inline-block">
                {t('midPeriodTermHint', {
                  name: selectedEmployee.name,
                  date: selectedEmployee.terminationDate,
                })}
              </p>
            )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isHr && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('apuracao')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
            >
              <Scale size={14} aria-hidden /> {t('goToApuracao')}
            </button>
          )}
          {period && (
            <span className="px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
              {t(statusLabelKey[period.status])}
            </span>
          )}
          {isSingleEmployee && currentEmployeeReview && (
            <span className="px-3 py-1.5 rounded-md text-xs font-semibold bg-violet-100 text-violet-800">
              {t('reviewBadgeLabel')}: {t(employeeReviewStatusKey[currentEmployeeReview.status])}
            </span>
          )}
          {locked ? (
            <span className="text-xs text-amber-950 font-semibold flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 border border-amber-200">
              <Lock size={14} aria-hidden /> {t('lockedHint')}
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
        <p className="font-semibold">{t('dataSourceTitle')}</p>
        <p className="text-xs mt-1 text-sky-900">{t('dataSourceBody')}</p>
      </div>

      {isHr && period && <PayrollPendenciesPanel periodId={period.id} />}

      {(punches.length === 0 || showRecalcHint) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
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
              onClick={() => void handleExportMirrorPdf()}
              disabled={!period || !hasQuery || days.length === 0 || isExportingPdf}
              title={
                !hasQuery || days.length === 0
                  ? t('mirrorPdfNoDays')
                  : undefined
              }
              className="h-10 px-4 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold tracking-wide flex items-center gap-2 hover:bg-slate-50 disabled:opacity-60"
            >
              <FileText size={14} className={isExportingPdf ? 'animate-pulse' : ''} aria-hidden />
              {isExportingPdf ? t('exportingMirrorPdf') : t('exportMirrorPdf')}
            </button>
            <button
              type="button"
              onClick={() => void handlePrePayrollExport()}
              disabled={!period || !['APPROVED', 'LOCKED'].includes(period.status)}
              className="h-10 px-4 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold tracking-wide flex items-center gap-2 hover:bg-slate-50 disabled:opacity-60"
            >
              <FileJson size={14} aria-hidden /> {t('exportPrePayroll')}
            </button>
            {isSingleEmployee && !locked && hasQuery && canApproveSelectedEmployee && (
              <button
                type="button"
                onClick={() => void openReviewModal('approve')}
                className="h-10 px-4 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-emerald-50"
              >
                <CheckCircle2 size={14} aria-hidden /> {t('approveEmployee')}
              </button>
            )}
            {period && period.status !== 'LOCKED' && isHr && hasQuery && (
              <button
                type="button"
                onClick={() => void openReviewModal('lock')}
                className="h-10 px-4 border border-amber-200 text-amber-700 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-amber-50"
              >
                <Lock size={14} aria-hidden /> {t('setLocked')}
              </button>
            )}
            </>
          )}
        </div>
      </div>

      <nav className="flex gap-1.5 p-1.5 bg-slate-100 rounded-xl w-full sm:w-fit" aria-label={t('viewModeLabel')}>
        <button
          type="button"
          onClick={() => setViewMode('summary')}
          className={orgTabButtonClass(viewMode === 'summary')}
          aria-current={viewMode === 'summary' ? 'page' : undefined}
        >
          {t('viewSummary')}
        </button>
        <button
          type="button"
          onClick={() => setViewMode('mirror')}
          className={orgTabButtonClass(viewMode === 'mirror')}
          aria-current={viewMode === 'mirror' ? 'page' : undefined}
        >
          {t('viewMirror')}
        </button>
      </nav>

      {employeeFilter === 'ALL' && hasQuery && reviewSummaryRows.length > 0 && (
        <TimesheetReviewSummaryPanel
          rows={reviewSummaryRows}
          locked={locked}
          onSelectEmployee={id => {
            skipNextFilterClear.current = true;
            setEmployeeFilter(id);
            void load(id);
          }}
        />
      )}

      {/* Primary mirror + secondary rail */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_17.5rem] gap-4 items-start">
        <div className="min-w-0">
          {isLoading || isBootstrapping ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 flex justify-center">
              <RefreshCw className="animate-spin text-primary" aria-hidden />
            </div>
          ) : !hasQuery ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700">{t('idleTitle')}</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">{t('idleHint')}</p>
            </div>
          ) : viewMode === 'mirror' && !isSingleEmployee ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700">{t('mirrorNeedEmployeeTitle')}</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">{t('mirrorNeedEmployee')}</p>
            </div>
          ) : days.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center text-slate-500 text-sm">
              {t('noDays')}
            </div>
          ) : visibleDays.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center text-slate-500 text-sm">
              {t('allDays')}: {t('noDays')}
            </div>
          ) : viewMode === 'mirror' ? (
            <TimesheetMirrorGrid
              days={visibleDays}
              punches={punches}
              user={user}
              locked={locked}
              isHr={isHr}
              isManager={isManager}
              dayStatusLabel={dayStatusLabel}
              fmtMinutes={mins => fmtMinutes(mins, t)}
              onAdjust={openAdjust}
              onAckEmployee={id => { void hrService.acknowledgeTimesheetDay(id, 'employee', true).then(load); }}
              onAckManager={id => { void handleManagerAckDay(id, true); }}
              onRevokeManagerAck={id => { void handleManagerAckDay(id, false); }}
              selectedDayIds={selectedDayIds}
              onToggleSelectDay={toggleSelectDay}
              onToggleSelectAll={toggleSelectAllVisible}
              allSelected={allVisibleSelected}
              bulkToolbar={
                isManager && !locked ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedDayIds.length > 0 && (
                      <>
                        <button
                          type="button"
                          disabled={isBulkAck || selectedDayIds.every(id => !approvablePendingIds.includes(id))}
                          onClick={() => handleBulkManagerAck(selectedDayIds)}
                          className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-semibold tracking-wide hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {isBulkAck
                            ? t('bulkManagerAckWorking')
                            : t('bulkManagerAck', {
                                count: selectedDayIds.filter(id => approvablePendingIds.includes(id)).length,
                              })}
                        </button>
                        <button
                          type="button"
                          disabled={isBulkAck || selectedDayIds.every(id => !approvedVisibleIds.includes(id))}
                          onClick={() => handleBulkManagerRevoke(selectedDayIds)}
                          className="h-8 px-3 border border-amber-300 text-amber-950 bg-amber-100 rounded-lg text-xs font-semibold tracking-wide hover:bg-amber-200 disabled:opacity-60"
                        >
                          {isBulkAck
                            ? t('bulkManagerRevokeWorking')
                            : t('bulkManagerRevoke', {
                                count: selectedDayIds.filter(id => approvedVisibleIds.includes(id)).length,
                              })}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={isBulkAck || approvablePendingIds.length === 0}
                      onClick={() => handleBulkManagerAck(approvablePendingIds)}
                      className="h-8 px-3 border border-emerald-200 text-emerald-800 bg-emerald-50 rounded-lg text-xs font-semibold tracking-wide hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {t('approveAllPending', { count: approvablePendingIds.length })}
                    </button>
                    <button
                      type="button"
                      disabled={isBulkAck || approvedVisibleIds.length === 0}
                      onClick={() => handleBulkManagerRevoke(approvedVisibleIds)}
                      className="h-8 px-3 border border-amber-300 text-amber-950 bg-amber-100 rounded-lg text-xs font-semibold tracking-wide hover:bg-amber-200 disabled:opacity-60"
                    >
                      {t('revokeAllApproved', { count: approvedVisibleIds.length })}
                    </button>
                  </div>
                ) : null
              }
            />
          ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <CalendarDays size={16} className="text-primary shrink-0" aria-hidden />
              <h2 className="text-sm font-semibold text-slate-800">{t('daysTitle')}</h2>
              {isManager && !locked && pendingManagerAckIds.length > 0 && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  {t('pendingManagerAck', { count: pendingManagerAckIds.length })}
                </span>
              )}
            </div>
            {isManager && !locked && (
              <div className="flex flex-wrap items-center gap-2">
                {selectedDayIds.length > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={isBulkAck || selectedDayIds.every(id => !approvablePendingIds.includes(id))}
                      onClick={() => handleBulkManagerAck(selectedDayIds)}
                      className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-semibold tracking-wide hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isBulkAck
                        ? t('bulkManagerAckWorking')
                        : t('bulkManagerAck', {
                            count: selectedDayIds.filter(id => approvablePendingIds.includes(id)).length,
                          })}
                    </button>
                    <button
                      type="button"
                      disabled={isBulkAck || selectedDayIds.every(id => !approvedVisibleIds.includes(id))}
                      onClick={() => handleBulkManagerRevoke(selectedDayIds)}
                      className="h-8 px-3 border border-amber-300 text-amber-950 bg-amber-100 rounded-lg text-xs font-semibold tracking-wide hover:bg-amber-200 disabled:opacity-60"
                    >
                      {isBulkAck
                        ? t('bulkManagerRevokeWorking')
                        : t('bulkManagerRevoke', {
                            count: selectedDayIds.filter(id => approvedVisibleIds.includes(id)).length,
                          })}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={isBulkAck || approvablePendingIds.length === 0}
                  onClick={() => handleBulkManagerAck(approvablePendingIds)}
                  className="h-8 px-3 border border-emerald-200 text-emerald-800 bg-emerald-50 rounded-lg text-xs font-semibold tracking-wide hover:bg-emerald-100 disabled:opacity-60"
                >
                  {t('approveAllPending', { count: approvablePendingIds.length })}
                </button>
                <button
                  type="button"
                  disabled={isBulkAck || approvedVisibleIds.length === 0}
                  onClick={() => handleBulkManagerRevoke(approvedVisibleIds)}
                  className="h-8 px-3 border border-amber-300 text-amber-950 bg-amber-100 rounded-lg text-xs font-semibold tracking-wide hover:bg-amber-200 disabled:opacity-60"
                >
                  {t('revokeAllApproved', { count: approvedVisibleIds.length })}
                </button>
              </div>
            )}
          </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left text-sm border-collapse">
                <thead className="bg-slate-50 text-slate-500 sticky top-0 z-[1]">
                  <tr>
                    {isManager && !locked && (
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary rounded border-slate-300"
                          checked={allVisibleSelected}
                          disabled={selectableDayIds.length === 0}
                          onChange={toggleSelectAllVisible}
                          aria-label={t('selectAllVisible')}
                          title={t('selectAllVisible')}
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
                  {visibleDays.map((d, index) => {
                    const name = empName(d.employeeId);
                    const canSelect = isManager && !locked;
                    const dayApprovable = isDayApprovable(
                      d,
                      punchesForTimesheetDay(d, punches),
                      coherenceCtxForDay(d),
                    );
                    const prevDate = index > 0 ? visibleDays[index - 1]?.workDate : null;
                    const showDateHeader = showDaySeparators && d.workDate !== prevDate;
                    const rowFocused = employeeFilter === 'ALL' && matchesFocusedEmployee(d.employeeId);
                    return (
                      <React.Fragment key={d.id}>
                        {showDateHeader && (
                          <tr className="bg-slate-100 border-t border-slate-200">
                            <td
                              colSpan={tableColSpan}
                              className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700"
                            >
                              {t('dayGroupLabel', { date: formatIsoDateBr(d.workDate) })}
                            </td>
                          </tr>
                        )}
                        <tr
                          className={`border-t border-slate-100 border-l-4 transition-colors ${
                            showDaySeparators ? 'cursor-pointer' : ''
                          } ${
                            rowFocused
                              ? 'bg-primary/10 border-l-primary'
                              : 'border-l-transparent hover:bg-primary/10'
                          }`}
                          onClick={
                            showDaySeparators
                              ? () => focusEmployeeFromDay(d.employeeId)
                              : undefined
                          }
                          aria-selected={rowFocused || undefined}
                        >
                        {isManager && !locked && (
                          <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
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
                        <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap tabular-nums">
                          {showDaySeparators ? (
                            <span className="text-slate-500 text-xs">{formatIsoDateBr(d.workDate)}</span>
                          ) : (
                            formatIsoDateBr(d.workDate)
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 max-w-[12rem]">
                          <span className="block truncate font-medium" title={name}>{name}</span>
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
                          {(() => {
                            const absence = displayAbsenceMinutes(d);
                            if (absence > 0) {
                              return (
                                <span className="inline-flex px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-medium">
                                  {fmtMinutes(absence, t)}
                                </span>
                              );
                            }
                            if (d.status === 'ADJUSTED' || (d.expectedMinutes > 0 && d.workedMinutes > 0)) {
                              return (
                                <span className="inline-flex px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-medium">
                                  {fmtMinutes(0, t)}
                                </span>
                              );
                            }
                            return <span className="text-slate-400">—</span>;
                          })()}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="font-medium text-slate-800">{dayStatusLabel(d.status)}</span>
                        </td>
                  <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-1 items-center">
                            {!d.managerAck && (isManager || isHr) && !locked && (
                              <button
                                type="button"
                                disabled={!dayApprovable.ok}
                                title={
                                  dayApprovable.ok
                                    ? undefined
                                    : t(dayAckBlockI18nKey(dayApprovable.reason || 'unknown'))
                                }
                                className="text-xs px-2 py-1 bg-slate-100 rounded-md hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                onClick={() => { void handleManagerAckDay(d.id, true); }}
                              >
                                {t('managerAck')}
                              </button>
                            )}
                            {d.managerAck && (
                              <>
                                <span className="text-emerald-700 text-xs font-semibold" title={t('managerAck')}>✓</span>
                                {(isManager || isHr) && !locked && (
                                  <button
                                    type="button"
                                    className="text-xs px-2 py-1 border border-amber-200 text-amber-900 bg-amber-50 rounded-md hover:bg-amber-100"
                                    onClick={() => { void handleManagerAckDay(d.id, false); }}
                                  >
                                    {t('revokeManagerAck')}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          {(isHr || isManager) && !locked && (
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
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
        </div>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Scale size={16} className="text-primary shrink-0" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-800">
                {railReady && railEmployeeName
                  ? t('hourBankFor', { name: railEmployeeName })
                  : t('hourBank')}
              </h3>
            </div>

            {railNeedsSelection ? (
              <p className="text-sm text-slate-600 leading-relaxed py-2">{t('railSelectEmployee')}</p>
            ) : (
              <>
                <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                  {fmtMinutes(bankBalance, t)}
                </p>
                <p className="text-xs text-slate-500 font-medium">{t('balance')}</p>

                {!bankEnabled && (
                  <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                    <p className="text-[11px] text-amber-800 leading-relaxed font-medium">{t('bankDisabledFrozenHint')}</p>
                  </div>
                )}

                {periodHours.expectedFull > 0 && (
                  <div className="flex items-center justify-between rounded-lg border border-primary/15 bg-primary-light/30 px-3 py-2">
                    <span className="text-[11px] font-semibold text-slate-600">{t('pdf.metricExpected')}</span>
                    <span className="text-sm font-bold text-slate-900 tabular-nums">{fmtMinutes(periodHours.expectedFull, t)}</span>
                  </div>
                )}

                {periodHours.dayCount > 0 && (
                  <div className="rounded-lg border border-slate-100 bg-slate-100 px-3 py-2.5 space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
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
              </>
            )}
          </div>

          {viewMode === 'summary' && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">
                {railReady && railEmployeeName
                  ? t('punchesTitleFor', { name: railEmployeeName })
                  : t('punchesTitle')}
              </h3>
              {isHr && !locked && (
                <button
                  type="button"
                  className="text-xs font-semibold text-primary shrink-0 hover:underline"
                  onClick={() => {
                    setPunchForm({
                      employeeId: employeeFilter !== 'ALL'
                        ? employeeFilter
                        : (focusedEmployeeId || employees[0]?.id || ''),
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
            {railNeedsSelection ? (
              <p className="text-sm text-slate-600 leading-relaxed py-2">{t('railSelectEmployee')}</p>
            ) : (
              <>
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
              </>
            )}
          </div>
          )}
        </aside>
      </div>

      {adjustDay && adjustDayCalcContext && (
        <TimesheetAdjustModal
          day={adjustDay}
          punches={adjustDayPunches}
          employeeName={empName(adjustDay.employeeId)}
          dayStatusLabel={dayStatusLabel}
          fmtMinutes={mins => fmtMinutes(mins, t)}
          canManageAck={(isManager || isHr) && !locked}
          canEditHours={(isHr || isManager) && !locked}
          fixedBreak={adjustFixedBreak}
          dayCalcContext={adjustDayCalcContext}
          onClose={() => setAdjustDay(null)}
          onSaveJustification={saveJustification}
          onSetManagerAck={async (acked) => {
            try {
              if (acked) {
                const dayPunchList = punchesForTimesheetDay(adjustDay, punches);
                const coherenceCtx = buildDayCoherenceContext(adjustDay, {
                  shift: adjustDayCalcContext.shift,
                  holidays,
                  leaves,
                  employee: employees.find(
                    e => e.id === adjustDay.employeeId || e.employeeId === adjustDay.employeeId,
                  ),
                });
                const v = isDayApprovable(adjustDay, dayPunchList, coherenceCtx);
                if (!v.ok) {
                  showToast(t(dayAckBlockI18nKey(v.reason || 'unknown')), 'warning');
                  return;
                }
              }
              await hrService.acknowledgeTimesheetDay(adjustDay.id, 'manager', acked);
              setAdjustDay(prev => (prev ? { ...prev, managerAck: acked } : null));
              showToast(acked ? t('managerAckOk') : t('revokeManagerAckOk'), 'success');
              await load();
            } catch (e: unknown) {
              toastAckError(e);
            }
          }}
          onAddPunch={addPunchFromModal}
          onUpdatePunch={updatePunchFromModal}
          onDeletePunch={deletePunchFromModal}
          onSetPunchIgnoredForCalc={setPunchIgnoredFromModal}
          onApplyFixedBreak={applyFixedBreakFromModal}
        />
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

      {reviewModal && (
        <TimesheetReviewModal
          mode={reviewModal}
          employeeName={selectedEmployee?.name}
          validation={reviewModal === 'lock' ? null : employeeReviewValidation}
          lockReadiness={lockReadiness ?? undefined}
          isWorking={isReviewWorking}
          onConfirm={() => void confirmReviewModal()}
          onClose={() => {
            if (isReviewWorking) return;
            setReviewModal(null);
            setLockReadiness(null);
          }}
        />
      )}
    </div>
  );
};

export default Timesheet;
