import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, FileDown } from 'lucide-react';
import { hrService } from '../services/hrService';
import RosterSwapModal, { SwapRequestList, filterSwapColleagues } from '../components/roster/RosterSwapModal';
import { Employee, RosterSwapRequest, User, WorkRosterAssignment, Shift } from '../types';
import { formatIsoDateBr } from '../i18n/format';
import { organizationService } from '../services/organization.service';
import { rosterPdfService } from '../services/rosterPdf.service';
import { useTranslation as useRosterTranslation } from 'react-i18next';

interface Props {
  user: User;
  onNavigate: (path: string) => void;
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

const MyRoster: React.FC<Props> = ({ user }) => {
  const { t, i18n } = useTranslation('mobile');
  const { t: tRoster } = useRosterTranslation('roster');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [assignments, setAssignments] = useState<WorkRosterAssignment[]>([]);
  const [holidays, setHolidays] = useState<Array<{ date: string; name: string }>>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [swaps, setSwaps] = useState<RosterSwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [swapTarget, setSwapTarget] = useState<WorkRosterAssignment | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);

  const employeeKeys = useMemo(
    () => [user.id, user.employeeId].filter(Boolean) as string[],
    [user.id, user.employeeId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = monthBounds(year, month);
      const [rows, hols, emps, swapRows, shiftList] = await Promise.all([
        hrService.listRosterForEmployee(employeeKeys, start, end),
        organizationService.getHolidays().catch(() => []),
        hrService.getEmployees(),
        hrService.listRosterSwapRequests(user.id),
        hrService.getShifts(),
      ]);
      setAssignments(rows);
      setHolidays(hols.map(h => ({ date: h.date, name: h.name })));
      setEmployees(emps);
      setSwaps(swapRows);
      setShifts(shiftList || []);
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

  const rosterDays = useMemo(() => {
    const holidayDates = new Set(holidays.map(h => h.date));
    const byDate = new Map<string, WorkRosterAssignment>();
    for (const a of assignments) {
      byDate.set(a.workDate, a);
    }

    const items: Array<{ date: string; assignment?: WorkRosterAssignment; kind: 'SATURDAY' | 'HOLIDAY' }> = [];
    const { start, end } = monthBounds(year, month);
    const cursor = new Date(`${start}T12:00:00`);
    const endD = new Date(`${end}T12:00:00`);

    while (cursor <= endD) {
      const iso = cursor.toISOString().slice(0, 10);
      if (holidayDates.has(iso)) {
        items.push({ date: iso, assignment: byDate.get(iso), kind: 'HOLIDAY' });
      } else if (isSaturday(iso)) {
        items.push({ date: iso, assignment: byDate.get(iso), kind: 'SATURDAY' });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return items;
  }, [assignments, holidays, month, year]);

  const today = new Date().toISOString().slice(0, 10);
  const colleagues = filterSwapColleagues(employees, user.id);
  const activeSwaps = swaps.filter(s => s.status === 'PENDING_PEER' || s.status === 'PENDING_MANAGER');

  const me = employees.find(e => e.id === user.id);
  const myShift = me?.shiftId ? shifts.find(s => s.id === me.shiftId) ?? null : null;

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

  return (
    <div className="space-y-5 pb-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t('myRosterTitle')}</h1>
          <p className="text-xs text-slate-500 mt-1">{t('myRosterSubtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pdfBusy || assignments.length === 0}
            onClick={() => void handleDownloadPdf()}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 disabled:opacity-50"
            aria-label={tRoster('exportMyPdf')}
          >
            {pdfBusy ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
          </button>
          <button
            type="button"
            onClick={() => { void load(); }}
            className="p-2 rounded-xl border border-slate-200 text-slate-500"
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
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
        >
          {[year - 1, year, year + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      ) : rosterDays.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">{t('noRosterDays')}</p>
      ) : (
        <div className="space-y-3">
          {rosterDays.map(({ date, assignment, kind }) => {
            const status = assignment?.status ?? 'OFF';
            const isWork = status === 'WORK';
            const canSwap = date > today;
            return (
              <article
                key={date}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{formatIsoDateBr(date)}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                    {kind === 'HOLIDAY' ? t('rosterHoliday') : t('rosterSaturday')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      isWork ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isWork ? t('rosterWork') : t('rosterOff')}
                  </span>
                  {canSwap && assignment && (
                    <button
                      type="button"
                      onClick={() => setSwapTarget(assignment)}
                      className="text-[10px] font-bold uppercase tracking-widest text-primary"
                    >
                      {t('requestSwap')}
                    </button>
                  )}
                  {canSwap && !assignment && (
                    <button
                      type="button"
                      onClick={() =>
                        setSwapTarget({
                          id: '',
                          workDate: date,
                          employeeId: user.employeeId || user.id,
                          status: 'OFF',
                          dayKind: kind,
                        })
                      }
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
          <SwapRequestList requests={activeSwaps} userId={user.id} onRefresh={() => { void load(); }} />
        </section>
      )}

      <RosterSwapModal
        open={!!swapTarget}
        assignment={swapTarget}
        colleagues={colleagues}
        requester={user}
        onClose={() => setSwapTarget(null)}
        onSent={() => { void load(); }}
      />
    </div>
  );
};

export default MyRoster;
