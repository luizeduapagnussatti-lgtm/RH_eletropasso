import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Download, Loader2, PenLine, Scale, Wallet } from 'lucide-react';
import { hrService } from '../services/hrService';
import { MyTimesheetDayCards } from '../components/timesheet/MyTimesheetDayCards';
import TimesheetSignModal from '../components/timesheet/TimesheetSignModal';
import { useToast } from '../context/ToastContext';
import {
  Employee,
  HourBankLedgerEntry,
  Punch,
  TimesheetDay,
  TimesheetEmployeeReview,
  TimesheetPeriod,
  TimesheetPeriodStatus,
  User,
} from '../types';
import { competenceForDate } from '../utils/payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../constants';
import { minutesToDisplay, minutesToHm } from '../utils/durationHm';
import { displayAbsenceMinutes } from '../utils/timesheetDisplay';
import { validateTimesheetEmployeeReview } from '../utils/timesheetReviewValidation';

function formatIsoDateBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}` : iso;
}

interface Props {
  user: User;
  onNavigate: (path: string) => void;
}

function fmtMinutes(mins: number) {
  return minutesToDisplay(mins);
}

function fmtSignedMinutes(mins: number) {
  const base = minutesToHm(mins);
  return mins > 0 ? `+${base}` : base;
}

function reviewStatusLabel(status: string | undefined, t: (k: string) => string): string {
  switch (status) {
    case 'IN_REVIEW':
      return t('mobile:reviewStatusInReview');
    case 'EMPLOYEE_SIGNED':
      return t('mobile:reviewStatusEmployeeSigned');
    case 'APPROVED':
      return t('mobile:reviewStatusApproved');
    default:
      return t('mobile:reviewStatusOpen');
  }
}

const PERIOD_STATUS_KEY: Record<TimesheetPeriodStatus, string> = {
  OPEN: 'statusOpen',
  IN_REVIEW: 'statusInReview',
  APPROVED: 'statusApproved',
  LOCKED: 'statusLocked',
};

const REVIEW_STATUS_KEY: Record<string, string> = {
  OPEN: 'reviewStatus_OPEN',
  IN_REVIEW: 'reviewStatus_IN_REVIEW',
  EMPLOYEE_SIGNED: 'reviewStatus_EMPLOYEE_SIGNED',
  APPROVED: 'reviewStatus_APPROVED',
};

function shiftCompetence(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function competenceKey(year: number, month: number): number {
  return year * 12 + month;
}

/** Prefer badge/crachá, then UUID — both may appear in timesheet_days / punches. */
function resolveEmployeeKeys(user: User, profile: Employee | undefined): string[] {
  const keys: string[] = [];
  const push = (v?: string | null) => {
    const s = (v || '').trim();
    if (s && !keys.includes(s)) keys.push(s);
  };
  push(profile?.employeeId);
  push(user.employeeId);
  push(profile?.id);
  push(user.id);
  return keys;
}

async function loadDaysForKeys(periodId: string, keys: string[]): Promise<TimesheetDay[]> {
  for (const key of keys) {
    const rows = await hrService.listTimesheetDays(periodId, key);
    if (rows.length > 0) return rows;
  }
  if (keys.length === 0) return [];
  const all = await hrService.listTimesheetDays(periodId);
  const keySet = new Set(keys);
  return all.filter((d) => keySet.has(d.employeeId));
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
  return [...byId.values()].sort(
    (a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime(),
  );
}

const MyTimesheet: React.FC<Props> = ({ user }) => {
  const { t } = useTranslation(['mobile', 'ptrp']);
  const { showToast } = useToast();
  const currentCompetence = useMemo(
    () => competenceForDate(new Date(), DEFAULT_PTRP_POLICY.periodStartDay),
    [],
  );

  const [year, setYear] = useState(currentCompetence.year);
  const [month, setMonth] = useState(currentCompetence.month);
  const [period, setPeriod] = useState<TimesheetPeriod | null>(null);
  const [days, setDays] = useState<TimesheetDay[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [review, setReview] = useState<TimesheetEmployeeReview | null>(null);
  const [bankEnabled, setBankEnabled] = useState<boolean>(DEFAULT_PTRP_POLICY.bankEnabled);
  const [bankBalance, setBankBalance] = useState<number>(0);
  const [bankEntries, setBankEntries] = useState<HourBankLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [employeeProfile, setEmployeeProfile] = useState<Employee | null>(null);

  const entryTypeLabel = useCallback(
    (type: string) => {
      const key = `ptrp:entryTypes.${type}`;
      const translated = t(key);
      return translated === key ? type : translated;
    },
    [t],
  );

  const periodLabel = `${String(month).padStart(2, '0')}/${year}`;
  const atCurrent =
    competenceKey(year, month) >= competenceKey(currentCompetence.year, currentCompetence.month);

  const goPrev = () => {
    const next = shiftCompetence(year, month, -1);
    setYear(next.year);
    setMonth(next.month);
  };

  const goNext = () => {
    if (atCurrent) return;
    const next = shiftCompetence(year, month, 1);
    setYear(next.year);
    setMonth(next.month);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const employees = await hrService.getEmployees().catch(() => [] as Employee[]);
      const profile =
        employees.find((e) => e.id === user.id) ||
        ({
          ...user,
          employeeId: (user as Employee).employeeId || user.id,
        } as Employee);
      setEmployeeProfile(profile);
      const keys = resolveEmployeeKeys(user, profile);
      const punchKey = keys[0] || user.id;

      const p = await hrService.getOrCreateTimesheetPeriod(year, month);
      setPeriod(p);

      const [dayList, reviewRowInitial] = await Promise.all([
        loadDaysForKeys(p.id, keys),
        hrService.getTimesheetEmployeeReview(p.id, user.id),
      ]);
      let reviewRow = reviewRowInitial;
      const eligible =
        reviewRow?.status !== 'APPROVED' &&
        reviewRow?.status !== 'EMPLOYEE_SIGNED' &&
        validateTimesheetEmployeeReview(dayList, undefined, undefined).canSubmit;
      if (eligible && (!reviewRow || reviewRow.status === 'OPEN')) {
        try {
          reviewRow =
            (await hrService.reconcileTimesheetEmployeeReviewAfterManagerAcks(
              p.id,
              user.id,
              user.id,
            )) || reviewRow;
        } catch (e) {
          console.error('[MyTimesheet] reconcile after manager acks failed', e);
        }
      }
      setDays(dayList);
      setReview(reviewRow);

      if (p.startDate && p.endDate) {
        const punchList = await loadPunchesForKeys(keys, p.startDate, p.endDate);
        setPunches(punchList);
      } else {
        setPunches([]);
      }

      const [config, balance, entries] = await Promise.all([
        hrService.getConfig().catch(() => null),
        hrService.getHourBankBalance(punchKey).catch(() => 0),
        p.startDate && p.endDate
          ? hrService.listHourBankEntries(punchKey, p.startDate, p.endDate).catch(() => [])
          : Promise.resolve([]),
      ]);
      setBankEnabled(config?.ptrpPolicy?.bankEnabled ?? DEFAULT_PTRP_POLICY.bankEnabled);
      setBankBalance(balance);
      setBankEntries(entries);
    } catch (e) {
      console.error(e);
      setLoadError(t('mobile:timesheetLoadFailed'));
      setDays([]);
      setPunches([]);
    } finally {
      setLoading(false);
    }
  }, [month, t, user, year]);

  useEffect(() => {
    void load();
    const unsub = hrService.subscribe(() => {
      void load();
    });
    return unsub;
  }, [load]);

  const totals = useMemo(
    () => ({
      expected: days.reduce((s, d) => s + (d.expectedMinutes || 0), 0),
      worked: days.reduce((s, d) => s + d.workedMinutes, 0),
      overtime: days.reduce((s, d) => s + d.overtimeMinutes, 0),
      absence: days.reduce((s, d) => s + displayAbsenceMinutes(d), 0),
    }),
    [days],
  );

  const locked = period?.status === 'LOCKED';
  const daysEligibleForSign = useMemo(
    () => validateTimesheetEmployeeReview(days).canSubmit,
    [days],
  );
  const canSign =
    !locked &&
    review?.status !== 'APPROVED' &&
    review?.status !== 'EMPLOYEE_SIGNED' &&
    (review?.status === 'IN_REVIEW' || daysEligibleForSign);

  const handleDownloadPdf = async () => {
    if (!period || days.length === 0) {
      showToast(t('ptrp:mirrorPdfNoDays'), 'warning');
      return;
    }
    const employee = employeeProfile;
    if (!employee) {
      showToast(t('ptrp:mirrorPdfEmployeeRequired'), 'warning');
      return;
    }
    setExportingPdf(true);
    try {
      const labels = {
        title: t('ptrp:pdf.title'),
        periodRange: t('ptrp:pdf.periodRange'),
        employeeSection: t('ptrp:pdf.employeeSection'),
        name: t('ptrp:pdf.name'),
        employeeId: t('ptrp:pdf.employeeId'),
        cpf: t('ptrp:pdf.cpf'),
        department: t('ptrp:pdf.department'),
        designation: t('ptrp:pdf.designation'),
        reviewStatus: t('ptrp:pdf.reviewStatus'),
        reviewApproved: t('ptrp:pdf.reviewApproved'),
        reviewPending: t('ptrp:pdf.reviewPending'),
        reviewPartial: t('ptrp:pdf.reviewPartial'),
        managerAckSummary: t('ptrp:pdf.managerAckSummary'),
        metricsSection: t('ptrp:pdf.metricsSection'),
        periodStatus: t('ptrp:pdf.periodStatus'),
        colDay: t('ptrp:pdf.colDay'),
        colEntry1: t('ptrp:pdf.colEntry1'),
        colExit1: t('ptrp:pdf.colExit1'),
        colEntry2: t('ptrp:pdf.colEntry2'),
        colExit2: t('ptrp:pdf.colExit2'),
        colWorked: t('ptrp:pdf.colWorked'),
        colOvertime: t('ptrp:pdf.colOvertime'),
        colAbsence: t('ptrp:pdf.colAbsence'),
        colStatus: t('ptrp:pdf.colStatus'),
        colEmployee: t('ptrp:pdf.colEmployee'),
        metricExpected: t('ptrp:pdf.metricExpected'),
        metricWorked: t('ptrp:pdf.metricWorked'),
        metricOvertime: t('ptrp:pdf.metricOvertime'),
        metricAbsence: t('ptrp:pdf.metricAbsence'),
        summarySection: t('ptrp:pdf.summarySection'),
        generatedBy: t('ptrp:pdf.generatedBy'),
        page: t('ptrp:pdf.page'),
        notAvailable: t('ptrp:pdf.notAvailable'),
        notesSection: t('ptrp:pdf.notesSection'),
        extraPunchesLine: t('ptrp:pdf.extraPunchesLine'),
        remarksLine: t('ptrp:pdf.remarksLine'),
        signatureEmployee: t('ptrp:pdf.signatureEmployee'),
        signatureManager: t('ptrp:pdf.signatureManager'),
        totalsRow: t('ptrp:pdf.totalsRow'),
        adjustedDayLegend: t('ptrp:pdf.adjustedDayLegend'),
      };
      const { blob, filename } = await hrService.exportTimesheetMirrorPdf({
        period,
        employeeFilter: employee.id,
        employees: [employee],
        days,
        punches,
        reviews: review ? [review] : [],
        labels,
        dayStatusLabel: (status: string) =>
          t(`ptrp:dayStatus_${status}`, { defaultValue: status }),
        reviewStatusLabel: (code: string) => {
          const key = REVIEW_STATUS_KEY[code];
          return key ? t(`ptrp:${key}`) : t('ptrp:pdf.reviewPending');
        },
        periodStatusLabel: (code: string) => {
          const key = PERIOD_STATUS_KEY[code as TimesheetPeriodStatus];
          return key ? t(`ptrp:${key}`) : code;
        },
        exportedBy: { id: user.id, name: user.name },
        requireManagerAcks: false,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('mobile:downloadPdfOk'), 'success');
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      if (raw === 'employee_no_days') {
        showToast(t('ptrp:mirrorPdfNoDays'), 'warning');
      } else {
        showToast(raw || t('mobile:downloadPdfFailed'), 'error');
      }
    } finally {
      setExportingPdf(false);
    }
  };

  const handleSignSubmit = async (payload: {
    selfieDataUrl: string;
    signatureDataUrl: string;
  }) => {
    if (!period) return;
    try {
      await hrService.signTimesheetEmployeeReview(period.id, user.id, payload);
      showToast(t('mobile:signSuccess'), 'success');
      setSignOpen(false);
      await load();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : '';
      const msg =
        raw === 'reviewNotInReview'
          ? t('ptrp:reviewNotInReview')
          : raw || t('mobile:signFailed');
      showToast(msg, 'error');
      throw e;
    }
  };

  if (loading && !period) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#e23d42]" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t('mobile:myTimesheetTitle')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {t('mobile:myTimesheetSubtitle', { period: periodLabel })}
        </p>
        <p className="text-[10px] text-slate-400 mt-2">{t('mobile:dataSourceNote')}</p>
      </header>

      <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 dark:border-slate-700/80 bg-white dark:bg-slate-900/60 px-2 py-2">
        <button
          type="button"
          onClick={goPrev}
          className="p-2 rounded-lg text-[#e23d42] hover:bg-[#c41e24]/10 active:scale-95 transition-transform"
          aria-label={t('mobile:prevCompetence')}
        >
          <ChevronLeft size={22} />
        </button>
        <div className="text-center min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            {t('mobile:competenceLabel')}
          </p>
          <p className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {periodLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={atCurrent}
          className="p-2 rounded-lg text-[#e23d42] hover:bg-[#c41e24]/10 active:scale-95 transition-transform disabled:opacity-30 disabled:pointer-events-none"
          aria-label={t('mobile:nextCompetence')}
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-[#c41e24]/12 text-[#e23d42]">
          {reviewStatusLabel(review?.status, t)}
        </span>
        {locked && (
          <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
            {t('mobile:reviewStatusLocked')}
          </span>
        )}
        {loading && (
          <Loader2 size={14} className="animate-spin text-[#e23d42]" aria-hidden />
        )}
      </div>

      {canSign ? (
        <div className="rounded-xl border border-[#c41e24]/30 bg-[#c41e24]/10 px-4 py-3 space-y-3">
          <p className="text-sm font-semibold text-[#c41e24]">{t('mobile:pendingSignTitle')}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {t('mobile:pendingSignBody')}
          </p>
          <button
            type="button"
            onClick={() => setSignOpen(true)}
            className="w-full py-3.5 rounded-xl bg-[#c41e24] text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <PenLine size={18} aria-hidden />
            {t('mobile:signTimesheet')}
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/80 rounded-xl px-4 py-3">
          {t('mobile:timesheetApprovalNote')}
        </p>
      )}

      {loadError && (
        <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
          {loadError}
        </p>
      )}

      <section className="rounded-2xl border border-slate-100 dark:border-slate-700/80 bg-white dark:bg-slate-900/60 p-4 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
          {t('mobile:periodTotals')}
        </h2>
        <div className="flex items-center justify-between rounded-xl border border-[#c41e24]/20 bg-[#c41e24]/10 px-3 py-2 mb-3">
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            {t('ptrp:pdf.metricExpected')}
          </span>
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {fmtMinutes(totals.expected)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/80 px-2 py-2.5">
            <p className="text-[9px] uppercase text-slate-400 font-bold">{t('mobile:workedHours')}</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
              {fmtMinutes(totals.worked)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/80 px-2 py-2.5">
            <p className="text-[9px] uppercase text-slate-400 font-bold">{t('mobile:overtimeHours')}</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
              {fmtMinutes(totals.overtime)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/80 px-2 py-2.5">
            <p className="text-[9px] uppercase text-slate-400 font-bold">{t('mobile:absenceHours')}</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
              {fmtMinutes(totals.absence)}
            </p>
          </div>
        </div>
        <p className="mt-2.5 text-[10px] leading-snug text-slate-400 dark:text-slate-500">
          {t('mobile:periodTotalsOtAbsenceHint')}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-100 dark:border-slate-700/80 bg-white dark:bg-slate-900/60 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Scale size={16} className="text-[#e23d42] shrink-0" aria-hidden />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {t('mobile:hourBankTitle')}
          </h2>
        </div>

        {bankEnabled ? (
          <>
            <p
              className={`text-2xl font-semibold tabular-nums ${
                bankBalance < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {minutesToHm(bankBalance)}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">{t('mobile:hourBankBalanceLabel')}</p>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2">
              {bankBalance >= 0 ? t('mobile:hourBankPositiveHint') : t('mobile:hourBankNegativeHint')}
            </p>

            {bankEntries.length > 0 ? (
              <ul className="mt-3 space-y-2 text-xs">
                {bankEntries
                  .slice(-12)
                  .reverse()
                  .map((e) => (
                    <li
                      key={e.id}
                      className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-1"
                    >
                      <span className="text-slate-500 truncate">
                        {formatIsoDateBr(e.entryDate)} · {entryTypeLabel(e.entryType)}
                      </span>
                      <span
                        className={`shrink-0 tabular-nums ${
                          e.minutesDelta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {fmtSignedMinutes(e.minutesDelta)}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11px] text-slate-400">{t('mobile:hourBankNoEntries')}</p>
            )}
          </>
        ) : (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-800/50 px-3 py-3">
            <Wallet size={16} className="text-amber-600 shrink-0 mt-0.5" aria-hidden />
            <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
              {t('mobile:hourBankDisabledNote')}
            </p>
          </div>
        )}
      </section>

      <section aria-label={t('mobile:dayListTitle')}>
        <div className="flex items-start justify-between gap-3 mb-2 px-0.5">
          <div className="min-w-0">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {t('mobile:dayListTitle')}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
              {t('mobile:dayListSummaryHint')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleDownloadPdf()}
            disabled={exportingPdf || loading || days.length === 0}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[#c41e24]/30 bg-[#c41e24]/10 px-3 py-2 text-xs font-semibold text-[#c41e24] disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            {exportingPdf ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Download size={14} aria-hidden />
            )}
            {t('mobile:downloadMirrorPdf')}
          </button>
        </div>
        {!loading && days.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 px-4">
            {t('mobile:noDaysApurado')}
          </p>
        ) : (
          <MyTimesheetDayCards days={days} punches={punches} fmtMinutes={fmtMinutes} />
        )}
      </section>

      <TimesheetSignModal
        open={signOpen}
        periodLabel={periodLabel}
        days={days}
        fmtMinutes={fmtMinutes}
        onClose={() => setSignOpen(false)}
        onSubmit={handleSignSubmit}
      />
    </div>
  );
};

export default MyTimesheet;
