import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const Timesheet: React.FC<Props> = ({ user }) => {
  const { t } = useTranslation('ptrp');
  const { showToast } = useToast();
  const isHr = user.role === 'ADMIN' || user.role === 'HR';
  const isManager = user.role === 'MANAGER' || isHr;

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [period, setPeriod] = useState<TimesheetPeriod | null>(null);
  const [days, setDays] = useState<TimesheetDay[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState(
    isHr || isManager ? 'ALL' : user.id
  );
  const [bankBalance, setBankBalance] = useState(0);
  const [bankEntries, setBankEntries] = useState<Awaited<ReturnType<typeof hrService.listHourBankEntries>>>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalc, setIsRecalc] = useState(false);
  const [adjustDay, setAdjustDay] = useState<TimesheetDay | null>(null);
  const [adjustForm, setAdjustForm] = useState({ workedMinutes: 0, overtimeMinutes: 0, lateMinutes: 0, remarks: '' });
  const [showManualPunch, setShowManualPunch] = useState(false);
  const [punchForm, setPunchForm] = useState({
    employeeId: '',
    punchedAt: '',
    direction: 'IN' as Punch['direction'],
  });

  const locked = period?.status === 'LOCKED';

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [emps, p] = await Promise.all([
        hrService.getEmployees(),
        hrService.getOrCreateTimesheetPeriod(year, month),
      ]);
      setEmployees(emps.filter(e => e.role !== 'SUPER_ADMIN'));
      setPeriod(p);

      const empId =
        employeeFilter === 'ALL'
          ? undefined
          : employees.find(e => e.id === employeeFilter)?.employeeId ||
            emps.find(e => e.id === employeeFilter)?.employeeId ||
            employeeFilter;

      const list = await hrService.listTimesheetDays(p.id, empId);
      // Filter by profile id vs matricula
      const filtered =
        employeeFilter === 'ALL'
          ? list
          : list.filter(d => {
              const emp = emps.find(e => e.id === employeeFilter || e.employeeId === employeeFilter);
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
          : emps.find(e => e.id === employeeFilter)?.employeeId || employeeFilter;
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
    } catch (e: any) {
      console.error(e);
      showToast(t('loadFailed'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [year, month, employeeFilter, user.id, user.employeeId, showToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

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
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{t('title')}</h1>
            <HelpButton topic="attendance" />
          </div>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {period && (
            <span className="px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase bg-slate-100 text-slate-600">
              {t(statusLabelKey[period.status])}
            </span>
          )}
          {locked ? (
            <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
              <Lock size={14} /> {t('lockedHint')}
            </span>
          ) : null}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-400 uppercase">{t('period')}</label>
          <div className="flex gap-2">
            <input
              type="number"
              className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              value={year}
              onChange={e => setYear(parseInt(e.target.value, 10) || year)}
            />
            <select
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              value={month}
              onChange={e => setMonth(parseInt(e.target.value, 10))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </div>
        </div>
        {(isHr || isManager) && (
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase">{t('employee')}</label>
            <select
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm min-w-[180px]"
              value={employeeFilter}
              onChange={e => setEmployeeFilter(e.target.value)}
            >
              {isHr && <option value="ALL">{t('allEmployees')}</option>}
              {employees
                .filter(e => isHr || e.lineManagerId === user.id || e.id === user.id)
                .map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
            </select>
          </div>
        )}
        {isHr && !locked && (
          <button
            onClick={handleRecalc}
            disabled={isRecalc}
            className="px-4 py-2.5 bg-primary text-white rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
          >
            <RefreshCw size={14} className={isRecalc ? 'animate-spin' : ''} />
            {isRecalc ? t('recalculating') : t('recalculate')}
          </button>
        )}
        {isHr && (
          <>
            <button onClick={handleExport} className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <Download size={14} /> {t('exportCsv')}
            </button>
            <button onClick={handleEsocial} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <FileJson size={14} /> {t('esocialStub')}
            </button>
          </>
        )}
        {isHr && period && period.status === 'OPEN' && (
          <button onClick={() => setStatus('IN_REVIEW')} className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold uppercase">{t('setInReview')}</button>
        )}
        {isHr && period && period.status === 'IN_REVIEW' && (
          <button onClick={() => setStatus('APPROVED')} className="px-4 py-2.5 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-semibold uppercase flex items-center gap-1">
            <CheckCircle2 size={14} /> {t('setApproved')}
          </button>
        )}
        {isHr && period && period.status === 'APPROVED' && (
          <button onClick={() => setStatus('LOCKED')} className="px-4 py-2.5 border border-amber-200 text-amber-700 rounded-xl text-xs font-semibold uppercase flex items-center gap-1">
            <Lock size={14} /> {t('setLocked')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-50 flex items-center gap-2">
            <CalendarDays size={16} className="text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">{t('title')}</h2>
          </div>
          {isLoading ? (
            <div className="p-10 flex justify-center"><RefreshCw className="animate-spin text-primary" /></div>
          ) : days.length === 0 ? (
            <p className="p-10 text-center text-slate-400 text-sm">{t('noDays')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-3 font-semibold">{t('date')}</th>
                    <th className="px-3 py-3 font-semibold">{t('employee')}</th>
                    <th className="px-3 py-3 font-semibold">{t('expected')}</th>
                    <th className="px-3 py-3 font-semibold">{t('worked')}</th>
                    <th className="px-3 py-3 font-semibold">{t('late')}</th>
                    <th className="px-3 py-3 font-semibold">{t('overtime')}</th>
                    <th className="px-3 py-3 font-semibold">{t('absence')}</th>
                    <th className="px-3 py-3 font-semibold">{t('status')}</th>
                    <th className="px-3 py-3 font-semibold">{t('ack')}</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {days.map(d => (
                    <tr key={d.id} className="border-t border-slate-50 hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 font-medium text-slate-800">{d.workDate}</td>
                      <td className="px-3 py-2.5 text-slate-600">{empName(d.employeeId)}</td>
                      <td className="px-3 py-2.5">{fmtMinutes(d.expectedMinutes, t)}</td>
                      <td className="px-3 py-2.5">{fmtMinutes(d.workedMinutes, t)}</td>
                      <td className="px-3 py-2.5 text-amber-700">{d.lateMinutes ? fmtMinutes(d.lateMinutes, t) : '—'}</td>
                      <td className="px-3 py-2.5 text-indigo-700">{d.overtimeMinutes ? fmtMinutes(d.overtimeMinutes, t) : '—'}</td>
                      <td className="px-3 py-2.5 text-rose-600">{d.absenceMinutes ? fmtMinutes(d.absenceMinutes, t) : '—'}</td>
                      <td className="px-3 py-2.5"><span className="font-semibold">{d.status}</span></td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          {!d.employeeAck && (d.employeeId === user.id || d.employeeId === user.employeeId) && !locked && (
                            <button
                              className="text-[9px] px-2 py-1 bg-slate-100 rounded-lg"
                              onClick={() => hrService.acknowledgeTimesheetDay(d.id, 'employee').then(load)}
                            >
                              {t('employeeAck')}
                            </button>
                          )}
                          {d.employeeAck && <span className="text-emerald-600">E✓</span>}
                          {!d.managerAck && isManager && !locked && (
                            <button
                              className="text-[9px] px-2 py-1 bg-slate-100 rounded-lg"
                              onClick={() => hrService.acknowledgeTimesheetDay(d.id, 'manager').then(load)}
                            >
                              {t('managerAck')}
                            </button>
                          )}
                          {d.managerAck && <span className="text-emerald-600">G✓</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {isHr && !locked && (
                          <button className="text-primary font-semibold" onClick={() => openAdjust(d)}>{t('adjust')}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Scale size={16} className="text-primary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider">{t('hourBank')}</h3>
            </div>
            <p className="text-2xl font-semibold text-slate-900">
              {fmtMinutes(bankBalance, t)}
            </p>
            <p className="text-[10px] text-slate-400 uppercase font-semibold">{t('balance')}</p>
            <ul className="max-h-48 overflow-y-auto space-y-2 text-xs">
              {bankEntries.slice(0, 20).map(e => (
                <li key={e.id} className="flex justify-between border-b border-slate-50 pb-1">
                  <span className="text-slate-500">{e.entryDate} · {e.entryType}</span>
                  <span className={e.minutesDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {e.minutesDelta >= 0 ? '+' : ''}{fmtMinutes(e.minutesDelta, t)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-700">{t('punchesTitle')}</h3>
              {isHr && !locked && (
                <button
                  className="text-[10px] font-semibold uppercase text-primary"
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
            <p className="text-[10px] text-slate-400">{t('punchesHint')}</p>
            {punches.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">{t('noPunches')}</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto space-y-2 text-xs">
                {punches.slice(0, 50).map(p => (
                  <li key={p.id} className="flex flex-col border-b border-slate-50 pb-2">
                    <span className="font-medium text-slate-800">{new Date(p.punchedAt).toLocaleString()}</span>
                    <span className="text-slate-500">
                      {empName(p.employeeId)} · {p.direction} · {p.source}
                      {p.nsr ? ` · NSR ${p.nsr}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {adjustDay && (
        <div className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="font-semibold text-slate-900">{t('adjust')} — {adjustDay.workDate}</h3>
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
