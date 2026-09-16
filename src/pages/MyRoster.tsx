import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, FileDown } from 'lucide-react';
import { hrService } from '../services/hrService';
import RosterSwapModal, { SwapRequestList, filterSwapColleagues } from '../components/roster/RosterSwapModal';
import { Employee, Punch, RosterSwapRequest, User, WorkRosterAssignment, Shift } from '../types';
import { formatIsoDateBr } from '../i18n/format';
import { organizationService } from '../services/organization.service';
import { rosterPdfService } from '../services/rosterPdf.service';
import { punchLocalDateKey, punchesForApuration } from '../services/punch.service';
import { isPjContractor } from '../utils/roles';
import { normalizeClockCredential, normalizePis } from '../utils/employeeCredentials';

interface Props {
  user: User;
  onNavigate: (path: string, params?: Record<string, unknown>) => void;
  initialYear?: number;
  initialMonth?: number;
  focusDate?: string;
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
}

function isSaturday(dateStr: string): boolean {
  return new Date(`${dateStr}T12:00:00`).getDay() === 6;
}

function parseFocusParts(focusDate?: string): { year?: number; month?: number } {
  if (!focusDate || !/^\d{4}-\d{2}-\d{2}$/.test(focusDate)) return {};
  return {
    year: Number(focusDate.slice(0, 4)),
    month: Number(focusDate.slice(5, 7)),
  };
}

/** Local calendar YYYY-MM-DD (America/São Paulo wall clock via browser TZ). */
function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function loadPunchesForKeys(
  keys: string[],
  startDate: string,
  endDate: string,
): Promise<Punch[]> {
  const byId = new Map<string, Punch>();
  for (const key of keys) {
    const rows = await hrService.listPunches({
      employeeId: key,
      startDate,
      endDate,
    });
    for (const p of rows) byId.set(p.id, p);
  }
  return [...byId.values()];
}

type DayDisplayStatus = 'WORK' | 'OFF' | 'UNPUBLISHED' | 'WORKED' | 'ABSENT';

const MyRoster: React.FC<Props> = ({
  user,
  initialYear,
  initialMonth,
  focusDate: focusDateProp,
}) => {
  const { t, i18n } = useTranslation('mobile');
  const { t: tRoster } = useTranslation('roster');
  const now = new Date();
  const fromFocus = parseFocusParts(focusDateProp);
  const [year, setYear] = useState(initialYear ?? fromFocus.year ?? now.getFullYear());
  const [month, setMonth] = useState(initialMonth ?? fromFocus.month ?? now.getMonth() + 1);
  const [focusDate, setFocusDate] = useState<string | undefined>(focusDateProp);
  const [assignments, setAssignments] = useState<WorkRosterAssignment[]>([]);
  const [holidays, setHolidays] = useState<Array<{ date: string; name: string }>>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [swaps, setSwaps] = useState<RosterSwapRequest[]>([]);
  const [punchedDates, setPunchedDates] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [swapTarget, setSwapTarget] = useState<WorkRosterAssignment | null>(null);
  const [swapColleagues, setSwapColleagues] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const focusRef = useRef<HTMLElement | null>(null);

  // Deep-link from notification: sync month/year when nav params change
  useEffect(() => {
    if (focusDateProp) {
      const parts = parseFocusParts(focusDateProp);
      if (parts.year) setYear(parts.year);
      if (parts.month) setMonth(parts.month);
      setFocusDate(focusDateProp);
    } else {
      if (typeof initialYear === 'number') setYear(initialYear);
      if (typeof initialMonth === 'number') setMonth(initialMonth);
    }
  }, [focusDateProp, initialYear, initialMonth]);

  const employeeKeys = useMemo(() => {
    const keys: string[] = [];
    const push = (v?: string | null) => {
      const s = (v || '').trim();
      if (s && !keys.includes(s)) keys.push(s);
    };
    push(user.id);
    push(user.employeeId);
    push(normalizePis(user.employeeId));
    const me = employees.find(e => e.id === user.id);
    if (me) {
      push(me.employeeId);
      push(normalizePis(me.employeeId));
      push(normalizeClockCredential(me.clockCredential));
    }
    return keys;
  }, [employees, user.employeeId, user.id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = monthBounds(year, month);
      const [rows, hols, emps, swapRows, shiftList, punches] = await Promise.all([
        hrService.listRosterForEmployee(employeeKeys, start, end),
        organizationService.getHolidays().catch(() => []),
        hrService.getEmployees(),
        hrService.listRosterSwapRequests(user.id),
        hrService.getShifts(),
        loadPunchesForKeys(employeeKeys, start, end).catch((e) => {
          console.error('[MyRoster] punches', e);
          return [] as Punch[];
        }),
      ]);
      setAssignments(rows);
      setHolidays(hols.map(h => ({ date: h.date, name: h.name })));
      setEmployees(emps);
      setSwaps(swapRows);
      setShifts(shiftList || []);
      const dates = new Set<string>();
      for (const p of punchesForApuration(punches)) {
        dates.add(punchLocalDateKey(p.punchedAt));
      }
      setPunchedDates(dates);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [employeeKeys, month, user.id, year]);

  useEffect(() => {
    void load();
    const unsub = hrService.subscribe(() => { void load(); });
    return unsub;
  }, [load]);

  const holidayNameByDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidays) m.set(h.date, h.name);
    return m;
  }, [holidays]);

  const today = localTodayIso();
  const meForPast = employees.find(e => e.id === user.id) || user;
  const pjNoClock = isPjContractor(meForPast);

  const rosterDays = useMemo(() => {
    const holidayDates = new Set(holidays.map(h => h.date));
    const byDate = new Map<string, WorkRosterAssignment>();
    for (const a of assignments) {
      byDate.set(a.workDate, a);
    }

    const items: Array<{
      date: string;
      assignment?: WorkRosterAssignment;
      kind: 'SATURDAY' | 'HOLIDAY';
      displayStatus: DayDisplayStatus;
      holidayName?: string;
    }> = [];
    const { start, end } = monthBounds(year, month);
    const cursor = new Date(`${start}T12:00:00`);
    const endD = new Date(`${end}T12:00:00`);

    while (cursor <= endD) {
      const iso = cursor.toISOString().slice(0, 10);
      const assignment = byDate.get(iso);
      let displayStatus: DayDisplayStatus = !assignment
        ? 'UNPUBLISHED'
        : assignment.status === 'WORK'
          ? 'WORK'
          : 'OFF';
      if (displayStatus === 'WORK' && iso < today) {
        displayStatus = (pjNoClock || punchedDates.has(iso)) ? 'WORKED' : 'ABSENT';
      }
      if (holidayDates.has(iso)) {
        items.push({
          date: iso,
          assignment,
          kind: 'HOLIDAY',
          displayStatus,
          holidayName: holidayNameByDate.get(iso),
        });
      } else if (isSaturday(iso)) {
        items.push({ date: iso, assignment, kind: 'SATURDAY', displayStatus });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return items;
  }, [assignments, holidayNameByDate, holidays, month, pjNoClock, punchedDates, today, year]);

  const upcomingWorkDates = useMemo(
    () => rosterDays.filter(d => d.displayStatus === 'WORK').map(d => formatIsoDateBr(d.date)),
    [rosterDays],
  );
  const workedPastDates = useMemo(
    () => rosterDays.filter(d => d.displayStatus === 'WORKED').map(d => formatIsoDateBr(d.date)),
    [rosterDays],
  );
  const absentPastDates = useMemo(
    () => rosterDays.filter(d => d.displayStatus === 'ABSENT').map(d => formatIsoDateBr(d.date)),
    [rosterDays],
  );

  useEffect(() => {
    if (!focusDate || loading) return;
    const el = focusRef.current;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusDate, loading, rosterDays]);

  const activeSwaps = swaps.filter(s => s.status === 'PENDING_PEER' || s.status === 'PENDING_MANAGER');

  useEffect(() => {
    if (!swapTarget) {
      setSwapColleagues([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await hrService.listRosterForDate(swapTarget.workDate);
        const statusByProfileId: Record<string, 'WORK' | 'OFF'> = {};
        for (const e of employees) {
          const keys = [e.id, e.employeeId].filter(Boolean) as string[];
          const hit = rows.find(r => keys.includes(r.employeeId));
          statusByProfileId[e.id] = hit?.status ?? 'OFF';
        }
        const selfStatus =
          statusByProfileId[user.id] ??
          (swapTarget.status === 'WORK' ? 'WORK' : 'OFF');
        if (!cancelled) {
          setSwapColleagues(
            filterSwapColleagues(employees, user.id, { selfStatus, statusByProfileId }),
          );
        }
      } catch {
        if (!cancelled) {
          setSwapColleagues(filterSwapColleagues(employees, user.id));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [swapTarget, employees, user.id]);

  const me = employees.find(e => e.id === user.id);
  const myShift = me?.shiftId ? shifts.find(s => s.id === me.shiftId) ?? null : null;
  const locale = i18n.language === 'en' ? 'en' : 'pt-BR';

  const handleDownloadPdf = async () => {
    if (!me) return;
    setPdfBusy(true);
    try {
      await rosterPdfService.exportIndividualPdf({
        year,
        month,
        employee: me,
        shift: myShift,
        holidays: holidays.map(h => ({ id: h.date, date: h.date, name: h.name, isGovernment: false, type: 'NATIONAL' as const })),
        rosterAssignments: assignments,
        labels: {
          titleTeam: tRoster('pdfTitleTeam'),
          titleIndividual: tRoster('pdfTitleIndividual'),
          monthLabel: tRoster('month'),
          employee: tRoster('pdfEmployee'),
          shift: tRoster('pdfShift'),
          department: tRoster('pdfDepartment'),
          legendWork: tRoster('working'),
          legendOff: tRoster('off'),
          legendHoliday: tRoster('holidayLabel'),
          legendSaturday: tRoster('saturdayLabel'),
          legendShiftDay: tRoster('pdfShiftDay'),
          colDate: tRoster('pdfColDate'),
          colDay: tRoster('pdfColDay'),
          colStatus: tRoster('pdfColStatus'),
          colShift: tRoster('pdfColShift'),
          generatedAt: tRoster('pdfGenerated'),
          page: tRoster('pdfPage'),
        },
        locale: i18n.language === 'en' ? 'en-US' : 'pt-BR',
      });
    } catch (e) {
      console.error(e);
    } finally {
      setPdfBusy(false);
    }
  };

  const statusBadge = (status: DayDisplayStatus) => {
    if (status === 'WORK') {
      return {
        label: t('rosterWork'),
        className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200',
      };
    }
    if (status === 'WORKED') {
      return {
        label: t('rosterWorked'),
        className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100',
      };
    }
    if (status === 'ABSENT') {
      return {
        label: t('rosterAbsent'),
        className: 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
      };
    }
    if (status === 'OFF') {
      return {
        label: t('rosterOff'),
        className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      };
    }
    return {
      label: t('rosterUnpublished'),
      className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
    };
  };

  const hasAnyWorkOutcome =
    upcomingWorkDates.length > 0 || workedPastDates.length > 0 || absentPastDates.length > 0;

  return (
    <div className="space-y-5 pb-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{t('myRosterTitle')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('myRosterSubtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pdfBusy || assignments.length === 0}
            onClick={() => void handleDownloadPdf()}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 disabled:opacity-50"
            aria-label={tRoster('exportMyPdf')}
          >
            {pdfBusy ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
          </button>
          <button
            type="button"
            onClick={() => { void load(); }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
            aria-label="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <div className="flex gap-2">
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>
              {new Date(2000, m - 1, 1).toLocaleString(locale, { month: 'long' })}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="w-24 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
        >
          {[year - 1, year, year + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {!loading && rosterDays.length > 0 && (
        <>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 space-y-1.5">
            {hasAnyWorkOutcome ? (
              <>
                {upcomingWorkDates.length > 0 && (
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    {t('rosterWorkSummary', {
                      count: upcomingWorkDates.length,
                      dates: upcomingWorkDates.join(', '),
                    })}
                  </p>
                )}
                {workedPastDates.length > 0 && (
                  <p className="text-sm text-emerald-800 dark:text-emerald-200">
                    {t('rosterWorkedSummary', {
                      count: workedPastDates.length,
                      dates: workedPastDates.join(', '),
                    })}
                  </p>
                )}
                {absentPastDates.length > 0 && (
                  <p className="text-sm text-rose-800 dark:text-rose-200">
                    {t('rosterAbsentSummary', {
                      count: absentPastDates.length,
                      dates: absentPastDates.join(', '),
                    })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">{t('rosterWorkSummaryEmpty')}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              {t('rosterWork')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-700" />
              {t('rosterWorked')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              {t('rosterAbsent')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              {t('rosterOff')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              {t('rosterUnpublished')}
            </span>
          </div>
        </>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      ) : rosterDays.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">{t('noRosterDays')}</p>
      ) : (
        <div className="space-y-3">
          {rosterDays.map(({ date, assignment, kind, displayStatus, holidayName }) => {
            const badge = statusBadge(displayStatus);
            const canSwap = date > today && !!assignment;
            const isFocused = focusDate === date;
            return (
              <article
                key={date}
                ref={isFocused ? (el) => { focusRef.current = el; } : undefined}
                className={`rounded-2xl border p-4 shadow-sm flex items-center justify-between gap-3 ${
                  isFocused
                    ? 'border-primary ring-2 ring-primary/40 bg-primary/5 dark:bg-primary/10'
                    : 'border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatIsoDateBr(date)}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                    {kind === 'HOLIDAY' ? t('rosterHoliday') : t('rosterSaturday')}
                    {holidayName ? ` · ${holidayName}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  {canSwap && (
                    <button
                      type="button"
                      onClick={() => setSwapTarget(assignment)}
                      className="text-[10px] font-bold uppercase tracking-widest text-primary"
                    >
                      {t('requestSwap')}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {activeSwaps.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
            {t('swapTabSent')} / {t('swapTabReceived')}
          </h2>
          <SwapRequestList
            requests={activeSwaps}
            userId={user.id}
            employees={employees}
            onRefresh={() => { void load(); }}
          />
        </section>
      )}

      <RosterSwapModal
        open={!!swapTarget}
        assignment={swapTarget}
        colleagues={swapColleagues}
        requester={user}
        onClose={() => setSwapTarget(null)}
        onSent={() => { void load(); }}
      />
    </div>
  );
};

export default MyRoster;
