import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock, MapPin, History, Search, RefreshCw, ChevronRight, ExternalLink,
  Camera, X, SortAsc, SortDesc, Users, Building, Trash2, Save,
  Calculator, UserX, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import { hrService } from '../services/hrService';
import { Attendance, Employee, AppConfig, Punch } from '../types';
import { consolidateAttendance, calculatePunctuality, calculateDuration } from '../utils/attendanceUtils';
import HelpButton from '../components/onboarding/HelpButton';
import { useToast } from '../context/ToastContext';
import { tStatus } from '../i18n/statusMaps';
import { DurationHmInput } from '../components/ui/DurationHmInput';
import { punchLocalDateKey } from '../services/punch.service';

interface AttendanceLogsProps {
  user: any;
  viewMode?: 'MY' | 'AUDIT';
  onNavigate?: (path: string, params?: any) => void;
}

type PunchDayRow = {
  key: string;
  date: string;
  employeeKey: string;
  profileId?: string;
  employeeName: string;
  department: string;
  matricula: string;
  firstAt: string;
  lastAt: string;
  firstHm: string;
  lastHm: string;
  count: number;
  activeCount: number;
  ignoredCount: number;
  sources: string[];
  punches: Punch[];
};

const LogSkeleton = () => (
  <div className="bg-white p-6 rounded-xl border border-slate-50 shadow-sm animate-pulse flex flex-col sm:flex-row sm:items-center justify-between gap-6">
    <div className="flex items-center gap-5">
      <div className="w-16 h-16 rounded-xl bg-slate-100 flex-shrink-0"></div>
      <div className="space-y-2">
        <div className="h-4 bg-slate-100 rounded w-24"></div>
        <div className="h-3 bg-slate-50 rounded w-32"></div>
      </div>
    </div>
    <div className="h-8 bg-slate-50 rounded-full w-20 hidden sm:block"></div>
  </div>
);

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgoLocal(n: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return isoDateLocal(d);
}

function formatHm(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function resolveEmployee(employees: Employee[], punchEmployeeId: string): Employee | undefined {
  return employees.find(
    e =>
      e.employeeId === punchEmployeeId ||
      e.id === punchEmployeeId ||
      (e.clockCredential != null && String(e.clockCredential) === punchEmployeeId)
  );
}

function buildPunchDayRows(punches: Punch[], employees: Employee[], locale: string): PunchDayRow[] {
  const byKey = new Map<string, Punch[]>();
  for (const p of punches) {
    const date = punchLocalDateKey(p.punchedAt);
    const key = `${p.employeeId}|${date}`;
    const list = byKey.get(key);
    if (list) list.push(p);
    else byKey.set(key, [p]);
  }

  const rows: PunchDayRow[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const emp = resolveEmployee(employees, first.employeeId);
    const active = sorted.filter(p => !p.ignoredForCalc);
    const sources = [...new Set(sorted.map(p => p.source))];
    rows.push({
      key,
      date: punchLocalDateKey(first.punchedAt),
      employeeKey: first.employeeId,
      profileId: emp?.id,
      employeeName: emp?.name || first.employeeId,
      department: emp?.department || '',
      matricula: emp?.employeeId || first.employeeId,
      firstAt: first.punchedAt,
      lastAt: last.punchedAt,
      firstHm: formatHm(first.punchedAt, locale),
      lastHm: formatHm(last.punchedAt, locale),
      count: sorted.length,
      activeCount: active.length,
      ignoredCount: sorted.length - active.length,
      sources,
      punches: sorted,
    });
  }
  return rows;
}

const AttendanceLogs: React.FC<AttendanceLogsProps> = ({ user, viewMode = 'MY', onNavigate }) => {
  const { t, i18n } = useTranslation('attendance');
  const { showToast } = useToast();
  const dateLocale = i18n.language === 'pt-BR' ? 'pt-BR' : 'en-GB';
  const isAdmin = user.role === 'ADMIN' || user.role === 'HR';
  const isTeamScope =
    user.role === 'MANAGER' || user.role === 'TEAM_LEAD' || user.role === 'MANAGEMENT';
  const isAuditMode = viewMode === 'AUDIT' && (isAdmin || isTeamScope);

  const [logs, setLogs] = useState<Attendance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [allPunches, setAllPunches] = useState<Punch[]>([]);

  const [periodStart, setPeriodStart] = useState(() => daysAgoLocal(30));
  const [periodEnd, setPeriodEnd] = useState(() => isoDateLocal(new Date()));

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const [selectedPunchDay, setSelectedPunchDay] = useState<PunchDayRow | null>(null);
  const [selectedLog, setSelectedLog] = useState<Attendance | null>(null);
  const [editState, setEditState] = useState<Partial<Attendance>>({});
  const [showSelfieHistory, setShowSelfieHistory] = useState(false);

  const [tempShift, setTempShift] = useState({ start: '09:00', end: '18:00', grace: 0 });

  const [showAbsentModal, setShowAbsentModal] = useState(false);
  const [absentForm, setAbsentForm] = useState({
    employeeId: '',
    date: isoDateLocal(new Date()),
    remarks: ''
  });

  const openAbsentModal = () => {
    setAbsentForm({
      employeeId: '',
      date: isoDateLocal(new Date()),
      remarks: t('absentDefaultRemarks')
    });
    setShowAbsentModal(true);
  };

  const filterManagedEmployees = useCallback(
    (fetchedEmployees: Employee[], teams: { id: string; leaderId?: string }[]) => {
      const myLedTeamIds = teams.filter(tm => tm.leaderId === user.id).map(tm => tm.id);
      return fetchedEmployees.filter(
        e =>
          (e.teamId && myLedTeamIds.includes(e.teamId)) ||
          (user.teamId && e.teamId === user.teamId) ||
          e.lineManagerId === user.id
      );
    },
    [user.id, user.teamId]
  );

  const fetchInitialData = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const yearAgo = new Date();
      yearAgo.setDate(yearAgo.getDate() - 365);
      const sinceYearAgo = yearAgo.toISOString().split('T')[0];

      if (isAuditMode) {
        const start = periodStart <= periodEnd ? periodStart : periodEnd;
        const end = periodStart <= periodEnd ? periodEnd : periodStart;

        const [punchResult, attendanceResult, fetchedEmployees, depts, appConfig, teams] =
          await Promise.all([
            hrService
              .listPunches({
                startDate: start,
                endDate: end,
              })
              .then(list => ({ ok: true as const, list }))
              .catch((err: unknown) => ({
                ok: false as const,
                list: [] as Punch[],
                err,
              })),
            hrService
              .getAttendance({ since: start, until: end, maxRows: 10000 })
              .then(list => ({ ok: true as const, list }))
              .catch((err: unknown) => ({
                ok: false as const,
                list: [] as Attendance[],
                err,
              })),
            hrService.getEmployees(),
            hrService.getDepartments(),
            hrService.getConfig(),
            hrService.getTeams().catch(() => []),
          ]);

        setConfig(appConfig);

        let scopedEmployees = fetchedEmployees;
        if (!isAdmin && isTeamScope) {
          scopedEmployees = filterManagedEmployees(fetchedEmployees, teams);
        }
        setEmployees(scopedEmployees);
        setDepartments(
          isAdmin
            ? depts
            : Array.from(
                new Set(scopedEmployees.map(e => e.department).filter(Boolean) as string[])
              )
        );

        const managedKeys = new Set<string>();
        for (const e of scopedEmployees) {
          if (e.id) managedKeys.add(e.id);
          if (e.employeeId) managedKeys.add(e.employeeId);
          if (e.clockCredential) managedKeys.add(String(e.clockCredential));
        }

        let punches = punchResult.list;
        if (!isAdmin && isTeamScope) {
          punches = punches.filter(p => managedKeys.has(p.employeeId));
        }
        setAllPunches(punches);

        let attendance = attendanceResult.list;
        if (!isAdmin && isTeamScope) {
          const managedIds = new Set(scopedEmployees.map(e => e.id));
          attendance = attendance.filter(a => managedIds.has(a.employeeId));
        }
        setLogs(attendance);

        if (!punchResult.ok && !attendanceResult.ok) {
          setLoadError(t('loadFailed'));
        } else if (!punchResult.ok) {
          setLoadError(t('loadPunchesFailed'));
        }
      } else {
        const attendanceScope = { since: sinceYearAgo, employeeId: user.id, maxRows: 2000 };
        const [allAttendance, appConfig] = await Promise.all([
          hrService.getAttendance(attendanceScope),
          hrService.getConfig(),
        ]);
        setConfig(appConfig);
        setLogs(allAttendance.filter(a => a.employeeId === user.id));
        setAllPunches([]);
      }
    } catch (err) {
      console.error('Failed to fetch logs', err);
      setLoadError(t('loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
    const unsub = hrService.subscribe(() => fetchInitialData());
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on scope/period; employee filter applied client-side for punches after first load
  }, [user.id, viewMode, user.role, periodStart, periodEnd, isAuditMode]);

  const ensureTimeFormat = (timeStr: string | undefined) => {
    if (!timeStr || timeStr === '-' || timeStr.trim() === '') return '';
    try {
      const parts = timeStr.trim().split(':');
      if (parts.length < 2) return '';
      const h = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      return `${h}:${m}`;
    } catch {
      return '';
    }
  };

  const handleOpenSelfieDetail = async (log: Attendance) => {
    setSelectedPunchDay(null);
    setSelectedLog(log);
    setEditState({
      status: log.status,
      checkIn: ensureTimeFormat(log.checkIn),
      checkOut: ensureTimeFormat(log.checkOut),
      remarks: log.remarks,
      date: log.date
    });
    const emp = employees.find(e => e.id === log.employeeId);
    const shift = await hrService.resolveShiftForEmployee(log.employeeId, emp?.shiftId, log.date);
    setTempShift({
      start: ensureTimeFormat(shift?.startTime || config?.officeStartTime || '09:00'),
      end: ensureTimeFormat(shift?.endTime || config?.officeEndTime || '18:00'),
      grace: shift?.lateGracePeriod ?? config?.lateGracePeriod ?? 0
    });
  };

  const handleManualAbsent = async () => {
    if (!absentForm.employeeId) return;
    setIsProcessing(true);
    try {
      const emp = employees.find(e => e.id === absentForm.employeeId);
      await hrService.saveAttendance({
        id: '',
        employeeId: absentForm.employeeId,
        employeeName: emp?.name,
        date: absentForm.date,
        checkIn: '-',
        checkOut: '-',
        status: 'ABSENT',
        remarks: `[Manual Entry] ${absentForm.remarks}`,
        location: { lat: 0, lng: 0, address: 'N/A' },
        dutyType: 'OFFICE'
      });
      setShowAbsentModal(false);
      await fetchInitialData();
    } catch {
      showToast(t('failedToSave'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm(t('confirmDelete'))) return;
    setIsProcessing(true);
    try {
      await hrService.deleteAttendance(id);
      setSelectedLog(null);
      await fetchInitialData();
    } catch {
      showToast(t('failedToDelete'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdate = async () => {
    if (!isAdmin || !selectedLog) return;
    setIsProcessing(true);
    try {
      const finalState = {
        ...editState,
        checkIn: editState.checkIn || '-',
        checkOut: editState.checkOut || '-'
      };
      await hrService.updateAttendance(selectedLog.id, finalState);
      setSelectedLog(null);
      await fetchInitialData();
    } catch {
      showToast(t('failedToUpdate'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const autoCalculateStatus = () => {
    if (!editState.checkIn) return;
    const newStatus = calculatePunctuality(editState.checkIn, tempShift.start, tempShift.grace);
    setEditState(prev => ({ ...prev, status: newStatus }));
  };

  const punchDayRows = useMemo(() => {
    if (!isAuditMode) return [];
    let rows = buildPunchDayRows(allPunches, employees, dateLocale);

    if (employeeFilter !== 'ALL') {
      const emp = employees.find(e => e.id === employeeFilter);
      rows = rows.filter(
        r =>
          r.profileId === employeeFilter ||
          r.employeeKey === employeeFilter ||
          (emp?.employeeId && r.employeeKey === emp.employeeId) ||
          (emp?.clockCredential && r.employeeKey === String(emp.clockCredential))
      );
    }
    if (deptFilter !== 'ALL') {
      rows = rows.filter(r => r.department === deptFilter);
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter(
        r =>
          r.date.includes(searchTerm) ||
          r.employeeName.toLowerCase().includes(q) ||
          r.matricula.toLowerCase().includes(q) ||
          r.sources.some(s => s.toLowerCase().includes(q))
      );
    }

    return rows.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return sortOrder === 'desc' ? -dateCompare : dateCompare;
      return sortOrder === 'desc'
        ? -a.firstHm.localeCompare(b.firstHm)
        : a.firstHm.localeCompare(b.firstHm);
    });
  }, [
    isAuditMode,
    allPunches,
    employees,
    dateLocale,
    employeeFilter,
    deptFilter,
    searchTerm,
    sortOrder,
  ]);

  const filteredAndSortedLogs = useMemo(() => {
    let result = [...logs];

    if (searchTerm) {
      result = result.filter(
        log =>
          (log.date || '').includes(searchTerm) ||
          (log.status || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (log.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (isAuditMode) {
      if (employeeFilter !== 'ALL') {
        result = result.filter(log => log.employeeId === employeeFilter);
      }
      if (deptFilter !== 'ALL') {
        result = result.filter(log => {
          const emp = employees.find(e => e.id === log.employeeId);
          return emp?.department === deptFilter;
        });
      }
    }

    const consolidated = consolidateAttendance(result);
    return consolidated.sort((a, b) => {
      const dateCompare = (a.date || '').localeCompare(b.date || '');
      if (dateCompare !== 0) {
        return sortOrder === 'desc' ? -dateCompare : dateCompare;
      }
      const timeA = a.checkIn || '';
      const timeB = b.checkIn || '';
      return sortOrder === 'desc' ? -timeA.localeCompare(timeB) : timeA.localeCompare(timeB);
    });
  }, [logs, searchTerm, employeeFilter, deptFilter, sortOrder, isAuditMode, employees]);

  const openTimesheet = (row: PunchDayRow) => {
    if (!onNavigate) return;
    const [y, m] = row.date.split('-').map(Number);
    onNavigate('timesheet', {
      employeeId: row.profileId || row.employeeKey,
      year: y,
      month: m,
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
              {isAuditMode ? (isAdmin ? t('audit') : t('teamAttendance')) : t('myHistory')}
            </h1>
            <HelpButton helpPointId={isAuditMode ? 'attendance.audit' : 'attendance.logs'} />
          </div>
          <p className="text-sm text-slate-500 font-medium">
            {isAuditMode ? t('auditSubtitle') : t('mySubtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && isAuditMode && (
            <button
              type="button"
              onClick={openAbsentModal}
              className="p-3 bg-rose-50 border border-rose-100 rounded-2xl shadow-sm text-rose-600 hover:bg-rose-100 transition-all flex items-center gap-2"
            >
              <UserX size={20} />{' '}
              <span className="text-xs font-bold uppercase hidden md:inline">{t('markAbsent')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={fetchInitialData}
            className="p-3 bg-white border border-slate-100 rounded-2xl shadow-sm text-slate-400 hover:text-primary transition-all"
          >
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {loadError && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">{loadError}</p>
            <button
              type="button"
              onClick={fetchInitialData}
              className="mt-1 text-xs font-bold uppercase tracking-wider underline"
            >
              {t('retryLoad')}
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-6 rounded-xl border border-slate-50 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-[2]">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-[1.5rem] text-sm font-bold outline-none focus:ring-4 focus:ring-primary-light"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {isAuditMode && (
            <>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  className="px-3 py-4 bg-slate-50 border border-slate-100 rounded-[1.5rem] text-sm font-bold"
                  value={periodStart}
                  onChange={e => setPeriodStart(e.target.value)}
                  aria-label={t('periodStart')}
                />
                <span className="text-slate-300 text-xs font-bold">—</span>
                <input
                  type="date"
                  className="px-3 py-4 bg-slate-50 border border-slate-100 rounded-[1.5rem] text-sm font-bold"
                  value={periodEnd}
                  onChange={e => setPeriodEnd(e.target.value)}
                  aria-label={t('periodEnd')}
                />
              </div>
              <div className="relative flex-1">
                <Users className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <select
                  className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-[1.5rem] text-sm font-bold outline-none appearance-none"
                  value={employeeFilter}
                  onChange={e => setEmployeeFilter(e.target.value)}
                >
                  <option value="ALL">{isAdmin ? t('allOrganization') : t('allManagedStaff')}</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
              {isAdmin && (
                <div className="relative flex-1">
                  <Building className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <select
                    className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-[1.5rem] text-sm font-bold outline-none appearance-none"
                    value={deptFilter}
                    onChange={e => setDeptFilter(e.target.value)}
                  >
                    <option value="ALL">{t('allDepartments')}</option>
                    {departments.map(d => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
            className="px-6 py-4 bg-slate-50 border border-slate-100 rounded-[1.5rem] flex items-center justify-center gap-3 text-slate-500 hover:text-primary hover:bg-white transition-all whitespace-nowrap"
          >
            {sortOrder === 'desc' ? <SortDesc size={20} /> : <SortAsc size={20} />}
            <span className="text-[10px] font-semibold uppercase tracking-widest">
              {sortOrder === 'desc' ? t('sortLatest') : t('sortOldest')}
            </span>
          </button>
        </div>
      </div>

      {/* Primary list: punches (AUDIT) or selfie logs (MY) */}
      <div className="space-y-4">
        {isAuditMode && (
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 px-1">
            {t('punchDaysHeading')}
          </h2>
        )}

        {isLoading ? (
          <>
            <LogSkeleton />
            <LogSkeleton />
            <LogSkeleton />
          </>
        ) : isAuditMode ? (
          <>
            {punchDayRows.map(row => (
              <div
                key={row.key}
                onClick={() => {
                  setSelectedLog(null);
                  setSelectedPunchDay(row);
                }}
                className="bg-white p-6 rounded-xl border border-slate-50 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-6"
              >
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex-shrink-0 flex items-center justify-center text-primary">
                    <Clock size={28} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-slate-900">
                        {new Date(row.date + 'T12:00:00').toLocaleDateString(dateLocale, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </h4>
                      <span className="px-2.5 py-1 rounded-lg text-[8px] font-semibold uppercase tracking-widest bg-emerald-50 text-emerald-600">
                        {t('punchCount', { count: row.count })}
                      </span>
                      {row.ignoredCount > 0 && (
                        <span className="px-2.5 py-1 rounded-lg text-[8px] font-semibold uppercase tracking-widest bg-amber-50 text-amber-600">
                          {t('ignoredCount', { count: row.ignoredCount })}
                        </span>
                      )}
                      {row.sources.map(src => (
                        <span
                          key={src}
                          className="px-2 py-0.5 rounded-md text-[8px] font-semibold uppercase tracking-widest bg-indigo-50 text-indigo-600"
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] font-semibold text-primary uppercase tracking-tight">
                      {row.employeeName}
                      <span className="text-slate-300 ml-1">({row.matricula || t('na')})</span>
                      {row.department ? (
                        <>
                          <span className="mx-2 text-slate-300">•</span>
                          {row.department}
                        </>
                      ) : null}
                    </p>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock size={12} className="text-primary" />
                      <span className="text-[10px] font-semibold uppercase tracking-tight">
                        {row.firstHm} — {row.count > 1 ? row.lastHm : t('singlePunch')}
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight
                  className="text-slate-200 group-hover:text-primary group-hover:translate-x-1 transition-all hidden sm:block"
                  size={24}
                />
              </div>
            ))}
            {!isLoading && punchDayRows.length === 0 && !loadError && (
              <div className="py-16 text-center space-y-4">
                <History size={48} className="mx-auto text-slate-100" />
                <p className="text-slate-400 font-semibold uppercase text-xs tracking-widest">
                  {t('noPunchesInPeriod')}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {filteredAndSortedLogs.map(log => {
              const emp = employees.find(e => e.id === log.employeeId);
              return (
                <div
                  key={`${log.employeeId}-${log.date}-${log.id}`}
                  onClick={() => handleOpenSelfieDetail(log)}
                  className="bg-white p-6 rounded-xl border border-slate-50 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-6"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex-shrink-0">
                      {log.selfie ? (
                        <img
                          src={log.selfie}
                          loading="lazy"
                          alt=""
                          className="w-full h-full object-cover scale-x-[-1]"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-200">
                          <Camera size={24} />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-900">
                          {new Date(log.date).toLocaleDateString(dateLocale, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </h4>
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[8px] font-semibold uppercase tracking-widest ${
                            log.status === 'LATE'
                              ? 'bg-amber-50 text-amber-600'
                              : log.status === 'ABSENT'
                                ? 'bg-rose-50 text-rose-600'
                                : 'bg-emerald-50 text-emerald-600'
                          }`}
                        >
                          {tStatus('attendance', log.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-primary" />
                          <span className="text-[10px] font-semibold uppercase tracking-tight">
                            {log.checkIn || '--:--'} — {log.checkOut || t('stillActive')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate max-w-[150px]">
                          <MapPin size={12} className="text-rose-500" />
                          <span className="text-[10px] font-semibold uppercase tracking-tight truncate">
                            {log.location?.address || t('unknownLocation')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    className="text-slate-200 group-hover:text-primary group-hover:translate-x-1 transition-all hidden sm:block"
                    size={24}
                  />
                </div>
              );
            })}
            {!isLoading && filteredAndSortedLogs.length === 0 && (
              <div className="py-20 text-center space-y-4">
                <History size={48} className="mx-auto text-slate-100" />
                <p className="text-slate-400 font-semibold uppercase text-xs tracking-widest">
                  {t('noMatchingLogs')}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Secondary: selfie / app attendance history (AUDIT only) */}
      {isAuditMode && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSelfieHistory(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
          >
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                {t('selfieHistoryHeading')}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{t('selfieHistoryHint')}</p>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-widest">
                {t('selfieHistoryCount', { count: filteredAndSortedLogs.length })}
              </span>
              {showSelfieHistory ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>
          {showSelfieHistory && (
            <div className="border-t border-slate-50 px-4 pb-4 space-y-3">
              {filteredAndSortedLogs.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">{t('noSelfieLogs')}</p>
              ) : (
                filteredAndSortedLogs.map(log => {
                  const emp = employees.find(e => e.id === log.employeeId);
                  return (
                    <div
                      key={`selfie-${log.employeeId}-${log.date}-${log.id}`}
                      onClick={() => handleOpenSelfieDetail(log)}
                      className="bg-slate-50 p-4 rounded-xl border border-slate-100 hover:bg-white hover:shadow-sm transition-all cursor-pointer flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-white border border-slate-100 flex-shrink-0">
                          {log.selfie ? (
                            <img
                              src={log.selfie}
                              loading="lazy"
                              alt=""
                              className="w-full h-full object-cover scale-x-[-1]"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-200">
                              <Camera size={18} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {log.employeeName || emp?.name || t('unknownUser')}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {log.date} · {log.checkIn || '--:--'} — {log.checkOut || t('stillActive')} ·{' '}
                            {tStatus('attendance', log.status)}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Punch day detail modal */}
      {selectedPunchDay && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-primary p-8 flex justify-between items-center text-white">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold uppercase tracking-tight">{t('punchDayDetail')}</h3>
                <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest">
                  {selectedPunchDay.employeeName} · {selectedPunchDay.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPunchDay(null)}
                className="hover:bg-white/10 p-2 rounded-xl transition-all"
              >
                <X size={28} />
              </button>
            </div>
            <div className="p-6 md:p-8 space-y-6 max-h-[80vh] overflow-y-auto no-scrollbar">
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 font-bold text-slate-600">
                  {t('punchCount', { count: selectedPunchDay.count })}
                </span>
                <span className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 font-bold text-slate-600">
                  {selectedPunchDay.firstHm} — {selectedPunchDay.lastHm}
                </span>
                {selectedPunchDay.sources.map(s => (
                  <span
                    key={s}
                    className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 font-bold text-indigo-600"
                  >
                    {s}
                  </span>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-2 pr-3">{t('time')}</th>
                      <th className="py-2 pr-3">{t('punchDirection')}</th>
                      <th className="py-2 pr-3">{t('punchSource')}</th>
                      <th className="py-2 pr-3">NSR</th>
                      <th className="py-2">{t('calcStatus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPunchDay.punches.map(p => (
                      <tr
                        key={p.id}
                        className={`border-t border-slate-50 ${p.ignoredForCalc ? 'opacity-50' : ''}`}
                      >
                        <td className="py-2.5 pr-3 font-medium">
                          {new Date(p.punchedAt).toLocaleString(dateLocale)}
                        </td>
                        <td className="py-2.5 pr-3">{p.direction}</td>
                        <td className="py-2.5 pr-3">{p.source}</td>
                        <td className="py-2.5 pr-3">{p.nsr || '—'}</td>
                        <td className="py-2.5">
                          {p.ignoredForCalc
                            ? t('ignoredForCalc', { source: p.ignoreSource || '—' })
                            : t('countsForCalc')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-50">
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => {
                      openTimesheet(selectedPunchDay);
                      setSelectedPunchDay(null);
                    }}
                    className="flex-1 py-4 bg-indigo-50 text-indigo-700 rounded-xl font-semibold uppercase text-[10px] tracking-widest hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                  >
                    <ExternalLink size={14} /> {t('openTimesheet')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedPunchDay(null)}
                  className="flex-1 py-4 bg-slate-900 text-white rounded-xl font-semibold uppercase text-[10px] tracking-widest"
                >
                  {t('closeLogView')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selfie log detail & admin edit modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-primary p-8 flex justify-between items-center text-white">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold uppercase tracking-tight">
                  {isAuditMode
                    ? isAdmin
                      ? t('modifyAuditRecord')
                      : t('teamMemberActivity')
                    : t('logDetails')}
                </h3>
                {isAuditMode && isAdmin && (
                  <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">
                    {t('manualCorrectionMode')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="hover:bg-white/10 p-2 rounded-xl transition-all"
              >
                <X size={28} />
              </button>
            </div>

            <div className="p-8 md:p-10 space-y-8 max-h-[80vh] overflow-y-auto no-scrollbar">
              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="w-48 h-60 rounded-xl overflow-hidden border-4 border-slate-100 shadow-xl bg-slate-50 flex-shrink-0 relative group">
                  {selectedLog.selfie ? (
                    <img
                      src={selectedLog.selfie}
                      alt=""
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-200 bg-slate-100">
                      <Camera size={48} />
                    </div>
                  )}
                </div>

                <div className="flex-1 w-full space-y-6">
                  <div className="space-y-1">
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">
                      {t('employeeProfile')}
                    </p>
                    <p className="font-semibold text-slate-900 text-xl leading-none">
                      {selectedLog.employeeName ||
                        (isAdmin || isTeamScope
                          ? employees.find(e => e.id === selectedLog.employeeId)?.name
                          : user.name)}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500">
                      {t('employeeIdLabel', {
                        id:
                          selectedLog.employeeId === user.id
                            ? user.employeeId
                            : employees.find(e => e.id === selectedLog.employeeId)?.employeeId ||
                              selectedLog.employeeId,
                      })}
                    </p>
                  </div>

                  {isAdmin && (
                    <div className="p-4 bg-primary-light/20 border border-primary-light rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-semibold text-primary uppercase tracking-widest flex items-center gap-2">
                          <Calculator size={10} /> {t('calculationParameters')}
                        </p>
                        <span className="text-[8px] font-bold text-primary-hover uppercase tracking-widest">
                          {t('doesNotSaveToDb')}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1 min-w-0 space-y-1">
                          <label className="text-[8px] font-semibold text-primary uppercase tracking-widest">
                            {t('shiftStart')}
                          </label>
                          <input
                            type="time"
                            className="w-full min-w-0 px-2 py-1.5 bg-white border border-primary-light rounded-lg text-xs font-bold text-slate-900"
                            value={tempShift.start}
                            onChange={e => setTempShift({ ...tempShift, start: e.target.value })}
                          />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <label className="text-[8px] font-semibold text-primary uppercase tracking-widest">
                            {t('shiftEnd')}
                          </label>
                          <input
                            type="time"
                            className="w-full min-w-0 px-2 py-1.5 bg-white border border-primary-light rounded-lg text-xs font-bold text-slate-900"
                            value={tempShift.end}
                            onChange={e => setTempShift({ ...tempShift, end: e.target.value })}
                          />
                        </div>
                        <div className="w-20 flex-shrink-0 space-y-1">
                          <label className="text-[8px] font-semibold text-primary uppercase tracking-widest">
                            {t('grace')}
                          </label>
                          <DurationHmInput
                            className="w-full min-w-0 px-2 py-1.5 bg-white border border-primary-light rounded-lg text-xs font-bold text-slate-900"
                            valueMinutes={tempShift.grace}
                            allowOver24h={false}
                            onChangeMinutes={grace => setTempShift({ ...tempShift, grace })}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-1">
                        <p className="text-[10px] font-medium text-primary">
                          {t('durationHours', {
                            hours: calculateDuration(editState.checkIn || '', editState.checkOut || ''),
                          })}
                        </p>
                        <button
                          type="button"
                          onClick={autoCalculateStatus}
                          className="text-[9px] font-semibold text-white bg-primary px-3 py-1 rounded-lg uppercase tracking-widest hover:bg-primary-hover transition-colors"
                        >
                          {t('recalculateStatus')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                        {t('logDate')}
                      </label>
                      <input
                        type="date"
                        readOnly={!isAdmin}
                        className={`w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold ${!isAdmin && 'opacity-70 cursor-not-allowed'}`}
                        value={editState.date}
                        onChange={e => setEditState({ ...editState, date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                        {t('status')}
                      </label>
                      {isAdmin ? (
                        <select
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold"
                          value={editState.status}
                          onChange={e => setEditState({ ...editState, status: e.target.value as any })}
                        >
                          <option value="PRESENT">{tStatus('attendance', 'PRESENT')}</option>
                          <option value="LATE">{tStatus('attendance', 'LATE')}</option>
                          <option value="ABSENT">{tStatus('attendance', 'ABSENT')}</option>
                          <option value="EARLY_OUT">{tStatus('attendance', 'EARLY_OUT')}</option>
                          <option value="LEAVE">{tStatus('attendance', 'LEAVE')}</option>
                        </select>
                      ) : (
                        <div className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-primary uppercase">
                          {tStatus('attendance', selectedLog.status)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                    {t('actualCheckIn')}
                  </label>
                  <input
                    type="time"
                    step="1"
                    readOnly={!isAdmin}
                    className={`w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-semibold text-sm ${!isAdmin ? 'opacity-70 cursor-not-allowed' : 'focus:ring-4 focus:ring-primary-light transition-all'}`}
                    value={editState.checkIn || ''}
                    onChange={e => setEditState({ ...editState, checkIn: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                    {t('actualCheckOut')}
                  </label>
                  <input
                    type="time"
                    step="1"
                    readOnly={!isAdmin}
                    className={`w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-semibold text-sm ${!isAdmin ? 'opacity-70 cursor-not-allowed' : 'focus:ring-4 focus:ring-primary-light transition-all'}`}
                    value={editState.checkOut || ''}
                    onChange={e => setEditState({ ...editState, checkOut: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2">
                  <MapPin size={12} className="text-rose-500" /> {t('gpsValidation')}
                </label>
                <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                  <div className="flex-1 pr-4">
                    <p className="text-xs font-bold text-slate-700">{selectedLog.location?.address}</p>
                    <p className="text-[9px] font-mono text-slate-400 mt-1">
                      {selectedLog.location?.lat.toFixed(6)}, {selectedLog.location?.lng.toFixed(6)}
                    </p>
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${selectedLog.location?.lat},${selectedLog.location?.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 bg-white text-primary rounded-xl shadow-sm border border-slate-50 hover:bg-primary hover:text-white transition-all"
                  >
                    <ExternalLink size={18} />
                  </a>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                  {t('auditTrail')}
                </label>
                <textarea
                  readOnly={!isAdmin}
                  placeholder={t('notesPlaceholder')}
                  className={`w-full p-5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium min-h-[100px] outline-none ${!isAdmin && 'opacity-70 cursor-not-allowed italic text-slate-500'}`}
                  value={editState.remarks}
                  onChange={e => setEditState({ ...editState, remarks: e.target.value })}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-50">
                {isAdmin ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDelete(selectedLog.id)}
                      disabled={isProcessing}
                      className="flex-1 py-5 bg-rose-50 text-rose-600 rounded-xl font-semibold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-rose-100 transition-all"
                    >
                      <Trash2 size={16} /> {t('deleteRecord')}
                    </button>
                    <button
                      type="button"
                      onClick={handleUpdate}
                      disabled={isProcessing}
                      className="flex-[1.5] py-5 bg-primary text-white rounded-xl font-semibold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 shadow-xl hover:bg-primary-hover transition-all"
                    >
                      {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}{' '}
                      {t('saveCorrections')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedLog(null)}
                    className="w-full py-5 bg-slate-900 text-white rounded-xl font-semibold uppercase text-[10px] tracking-widest shadow-xl"
                  >
                    {t('closeLogView')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showAbsentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-sm font-semibold uppercase tracking-widest">{t('manualAbsentEntry')}</h3>
              <button type="button" onClick={() => setShowAbsentModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase">{t('employee')}</label>
                <select
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold"
                  value={absentForm.employeeId}
                  onChange={e => setAbsentForm({ ...absentForm, employeeId: e.target.value })}
                >
                  <option value="">{t('selectEmployee')}</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase">
                  {t('dateOfAbsence')}
                </label>
                <input
                  type="date"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold"
                  value={absentForm.date}
                  onChange={e => setAbsentForm({ ...absentForm, date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase">
                  {t('reasonRemarks')}
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold"
                  value={absentForm.remarks}
                  onChange={e => setAbsentForm({ ...absentForm, remarks: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={handleManualAbsent}
                disabled={isProcessing}
                className="w-full py-4 bg-rose-600 text-white rounded-xl font-semibold uppercase text-xs tracking-widest shadow-lg hover:bg-rose-700 transition-all"
              >
                {t('confirmAbsent')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceLogs;
