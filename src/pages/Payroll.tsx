import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileJson,
  FileSpreadsheet,
  Lock,
  CheckCircle2,
  Download,
  Package,
  FileCode2,
  Send,
  ChevronDown,
  ChevronUp,
  Upload,
  PenLine,
  AlertCircle,
} from 'lucide-react';
import { hrService } from '../services/hrService';
import { useToast } from '../context/ToastContext';
import {
  PayrollAccountingHandoff,
  PayrollConsolidation,
  PayrollPaymentSlip,
  TimesheetPeriod,
} from '../types';
import { PayrollPendenciesPanel } from '../components/payroll/PayrollPendenciesPanel';
import HelpButton from '../components/onboarding/HelpButton';

interface Props {
  user: { id: string; role: string };
  onNavigate?: (path: string) => void;
}

const WORKFLOW_STEPS = [
  'READY',
  'SENT_TO_ACCOUNTING',
  'FOLHA_RECEIVED',
  'ACK_COLLECTING',
  'CLOSED',
] as const;

const Payroll: React.FC<Props> = ({ user, onNavigate }) => {
  const { t } = useTranslation('payroll');
  const { t: tPtrp } = useTranslation('ptrp');
  const { showToast } = useToast();
  const canManage = ['ADMIN', 'HR'].includes(user.role);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [period, setPeriod] = useState<TimesheetPeriod | null>(null);
  const [rows, setRows] = useState<PayrollConsolidation[]>([]);
  const [handoff, setHandoff] = useState<PayrollAccountingHandoff | null>(null);
  const [slips, setSlips] = useState<PayrollPaymentSlip[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [slipEdits, setSlipEdits] = useState<Record<string, Partial<PayrollPaymentSlip>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await hrService.getOrCreateTimesheetPeriod(year, month);
      setPeriod(p);
      setRows(await hrService.listPayrollConsolidations(p.id));
      setHandoff(await hrService.getPayrollAccountingHandoff(p.id));
      setSlips(await hrService.listPayrollPaymentSlips(p.id));
      const events = await hrService.listEsocialEventsForPeriod(p.id);
      setLastEventId(events[0]?.id || null);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('buildFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [year, month, showToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodOk = period && ['APPROVED', 'LOCKED'].includes(period.status);
  const workflowStatus = handoff?.workflowStatus || 'READY';
  const stepIndex = WORKFLOW_STEPS.indexOf(workflowStatus as (typeof WORKFLOW_STEPS)[number]);

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBuild = async () => {
    if (!period) return;
    setBusy(true);
    try {
      const gaps = await hrService.listPayrollReadinessGaps(period.id);
      if (gaps.length) {
        showToast(t('softBlockWarning', { count: gaps.length }), 'warning');
      }
      setRows(await hrService.buildPayrollConsolidation(period.id));
      showToast(t('buildOk'), 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('buildFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadMirror = async () => {
    if (!period) return;
    setBusy(true);
    try {
      if (!rows.length) {
        setRows(await hrService.buildPayrollConsolidation(period.id));
      }
      const zip = await hrService.buildAccountingMirrorZip(period);
      downloadBlob(zip, `espelho-contabilidade_${year}_${String(month).padStart(2, '0')}.zip`);
      showToast(t('mirrorDownloadOk'), 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('mirrorDownloadFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSendAccounting = async () => {
    if (!period) return;
    setBusy(true);
    try {
      setHandoff(await hrService.sendPayrollToAccounting(period.id, user.id));
      setSlips(await hrService.listPayrollPaymentSlips(period.id));
      showToast(t('sentAccountingOk'), 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('sentAccountingFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleFolhaReceived = async () => {
    if (!period) return;
    setBusy(true);
    try {
      setHandoff(await hrService.markPayrollFolhaReceived(period.id, user.id));
      showToast(t('folhaReceivedOk'), 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('folhaReceivedFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSlipValues = async (slip: PayrollPaymentSlip) => {
    const edit = slipEdits[slip.id];
    if (!edit) return;
    try {
      await hrService.updatePayrollSlipAccounting(slip.id, {
        accHe50Hours: edit.accHe50Hours,
        accHe100Hours: edit.accHe100Hours,
        accNightHours: edit.accNightHours,
        accLateHours: edit.accLateHours,
        accAbsenceHours: edit.accAbsenceHours,
      });
      setSlips(await hrService.listPayrollPaymentSlips(slip.periodId));
      showToast(t('slipSavedOk'), 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('slipSavedFailed'), 'error');
    }
  };

  const handleUploadSlip = async (slipId: string, file: File) => {
    try {
      await hrService.uploadPayrollSlipFile(slipId, file);
      if (period) setSlips(await hrService.listPayrollPaymentSlips(period.id));
      showToast(t('slipUploadOk'), 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('slipUploadFailed'), 'error');
    }
  };

  const handleSignSlip = async (slipId: string) => {
    try {
      await hrService.signPayrollSlip(slipId);
      if (period) setSlips(await hrService.listPayrollPaymentSlips(period.id));
      showToast(t('slipSignedOk'), 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('slipSignedFailed'), 'error');
    }
  };

  const handleRequestCorrection = async (slipId: string) => {
    const notes = window.prompt(t('correctionPrompt'));
    if (!notes?.trim()) return;
    try {
      await hrService.requestPayrollSlipCorrection(slipId, notes);
      if (period) setSlips(await hrService.listPayrollPaymentSlips(period.id));
      showToast(t('correctionRequestedOk'), 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('correctionRequestedFailed'), 'error');
    }
  };

  const handleClosePeriod = async () => {
    if (!period) return;
    const pending = slips.filter(s => s.acknowledgmentStatus === 'PENDING').length;
    if (pending && !window.confirm(t('closeWithPendingConfirm', { count: pending }))) return;
    try {
      setHandoff(await hrService.closePayrollAccountingPeriod(period.id));
      showToast(t('periodClosedOk'), 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('periodClosedFailed'), 'error');
    }
  };

  const handleExportJson = async () => {
    if (!period) return;
    setBusy(true);
    try {
      const data = await hrService.buildPayrollExportV1(period.id);
      downloadBlob(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
        `pre-folha_${year}_${String(month).padStart(2, '0')}.json`
      );
      showToast(t('exportOk'), 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('exportFailed');
      showToast(msg === 'employer_cnpj_missing' ? t('employerMissingCnpj') : msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = async () => {
    if (!period) return;
    setBusy(true);
    try {
      const data = await hrService.buildPayrollExportV1(period.id);
      downloadBlob(
        new Blob([hrService.exportPayrollCsv(data)], { type: 'text/csv;charset=utf-8' }),
        `pre-folha_${year}_${String(month).padStart(2, '0')}.csv`
      );
      showToast(t('exportOk'), 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('exportFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleXml = async () => {
    if (!period) return;
    setBusy(true);
    try {
      const { eventId, xml, validationOk, errors } = await hrService.generateS1200Draft(period.id);
      setLastEventId(eventId);
      downloadBlob(new Blob([xml], { type: 'application/xml' }), `S-1200_${year}_${String(month).padStart(2, '0')}.xml`);
      showToast(validationOk ? t('xmlOk') : `${t('xmlFailed')}: ${errors.join('; ')}`, validationOk ? 'success' : 'warning');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('xmlFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handlePackage = async () => {
    if (!period) return;
    setBusy(true);
    try {
      const zip = await hrService.buildEsocialZipPackage(period.id);
      downloadBlob(zip, `esocial_pacote_${year}_${String(month).padStart(2, '0')}.zip`);
      showToast(t('packageOk'), 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t('packageFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const updateSlipEdit = (slipId: string, field: keyof PayrollPaymentSlip, value: number) => {
    setSlipEdits(prev => ({
      ...prev,
      [slipId]: { ...prev[slipId], [field]: value },
    }));
  };

  const slipValue = (slip: PayrollPaymentSlip, field: keyof PayrollPaymentSlip) => {
    const edit = slipEdits[slip.id];
    if (edit && field in edit && edit[field] !== undefined) return Number(edit[field]);
    return Number(slip[field] ?? 0);
  };

  const signedCount = slips.filter(s => s.acknowledgmentStatus === 'SIGNED').length;
  const correctionCount = slips.filter(s => s.acknowledgmentStatus === 'CORRECTION_REQUESTED').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
            <HelpButton topic="payroll.pre-folha" />
          </div>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('timesheet')}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {t('viewTimesheet')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-end bg-white p-4 rounded-xl border border-slate-100">
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase">{tPtrp('year')}</label>
          <input type="number" className="block w-24 px-3 py-2 border rounded-lg font-bold" value={year} onChange={e => setYear(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase">{tPtrp('month')}</label>
          <input type="number" min={1} max={12} className="block w-20 px-3 py-2 border rounded-lg font-bold" value={month} onChange={e => setMonth(Number(e.target.value))} />
        </div>
        <button type="button" onClick={() => void load()} className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-semibold">
          {tPtrp('applyFilters')}
        </button>
      </div>

      {period && <PayrollPendenciesPanel periodId={period.id} />}

      {!periodOk && period && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          {t('periodRequired')} ({period.status})
        </p>
      )}

      {periodOk && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            {(['stepMirror', 'stepSend', 'stepFolha', 'stepAck'] as const).map((key, i) => (
              <div
                key={key}
                className={`rounded-xl border px-3 py-3 text-center text-xs font-semibold ${
                  i <= stepIndex ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 bg-white text-slate-400'
                }`}
              >
                <span className="block text-[10px] uppercase opacity-70">{t('stepLabel', { n: i + 1 })}</span>
                {t(key)}
              </div>
            ))}
          </div>

          {/* Passo 1 — Espelho */}
          <section className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
            <h2 className="font-bold text-slate-900">{t('stepMirror')}</h2>
            <p className="text-sm text-slate-500">{t('stepMirrorHint')}</p>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void handleBuild()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50">
                  <FileSpreadsheet size={14} /> {busy ? t('buildingPrePayroll') : t('buildPrePayroll')}
                </button>
                <button type="button" disabled={busy} onClick={() => void handleDownloadMirror()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50">
                  <Download size={14} /> {t('downloadMirrorZip')}
                </button>
              </div>
            )}
            {loading ? (
              <p className="text-sm text-slate-500">…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-slate-500">{t('noConsolidations')}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2">{t('colEmployee')}</th>
                      <th className="text-right px-3 py-2">{t('colHe50')}</th>
                      <th className="text-right px-3 py-2">{t('colHe100')}</th>
                      <th className="text-right px-3 py-2">{t('colNight')}</th>
                      <th className="text-right px-3 py-2">{t('colLate')}</th>
                      <th className="text-right px-3 py-2">{t('colAbsence')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium">{r.employeeName || r.employeeId}</td>
                        <td className="px-3 py-2 text-right">{r.extraHours50.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{r.extraHours100.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{r.nightHours.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{r.lateHours.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{r.absenceHours.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Passo 2 — Contabilidade */}
          {canManage && (
            <section className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
              <h2 className="font-bold text-slate-900">{t('stepSend')}</h2>
              <p className="text-sm text-slate-500">{t('stepSendHint')}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !rows.length} onClick={() => void handleDownloadMirror()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50">
                  <Package size={14} /> {t('downloadMirrorZip')}
                </button>
                <button
                  type="button"
                  disabled={busy || !rows.length || workflowStatus !== 'READY'}
                  onClick={() => void handleSendAccounting()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50"
                >
                  <Send size={14} /> {t('markSentAccounting')}
                </button>
              </div>
              {handoff?.sentToAccountingAt && (
                <p className="text-xs text-slate-500">{t('sentAt', { date: new Date(handoff.sentToAccountingAt).toLocaleString() })}</p>
              )}
            </section>
          )}

          {/* Passo 3 — Folha recebida */}
          {canManage && stepIndex >= 1 && (
            <section className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
              <h2 className="font-bold text-slate-900">{t('stepFolha')}</h2>
              <p className="text-sm text-slate-500">{t('stepFolhaHint')}</p>
              {workflowStatus === 'SENT_TO_ACCOUNTING' && (
                <button type="button" disabled={busy} onClick={() => void handleFolhaReceived()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50">
                  <CheckCircle2 size={14} /> {t('markFolhaReceived')}
                </button>
              )}
              {slips.length > 0 && stepIndex >= 2 && (
                <div className="overflow-x-auto rounded-lg border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">{t('colEmployee')}</th>
                        <th className="text-right px-3 py-2">{t('refHe50')}</th>
                        <th className="text-right px-3 py-2">{t('accHe50')}</th>
                        <th className="text-right px-3 py-2">{t('refHe100')}</th>
                        <th className="text-right px-3 py-2">{t('accHe100')}</th>
                        <th className="text-right px-3 py-2">{t('refNight')}</th>
                        <th className="text-right px-3 py-2">{t('accNight')}</th>
                        <th className="text-right px-3 py-2">{t('refLate')}</th>
                        <th className="text-right px-3 py-2">{t('accLate')}</th>
                        <th className="text-right px-3 py-2">{t('refAbsence')}</th>
                        <th className="text-right px-3 py-2">{t('accAbsence')}</th>
                        <th className="px-3 py-2">{t('colSlip')}</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {slips.map(slip => (
                        <tr key={slip.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium">{slip.employeeName || slip.employeeId}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{slip.refHe50Hours.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" step="0.01" className="w-16 text-right border rounded px-1 py-0.5 text-xs" value={slipValue(slip, 'accHe50Hours')} onChange={e => updateSlipEdit(slip.id, 'accHe50Hours', Number(e.target.value))} />
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">{slip.refHe100Hours.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" step="0.01" className="w-16 text-right border rounded px-1 py-0.5 text-xs" value={slipValue(slip, 'accHe100Hours')} onChange={e => updateSlipEdit(slip.id, 'accHe100Hours', Number(e.target.value))} />
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">{slip.refNightHours.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" step="0.01" className="w-16 text-right border rounded px-1 py-0.5 text-xs" value={slipValue(slip, 'accNightHours')} onChange={e => updateSlipEdit(slip.id, 'accNightHours', Number(e.target.value))} />
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">{slip.refLateHours.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" step="0.01" className="w-16 text-right border rounded px-1 py-0.5 text-xs" value={slipValue(slip, 'accLateHours')} onChange={e => updateSlipEdit(slip.id, 'accLateHours', Number(e.target.value))} />
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">{slip.refAbsenceHours.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" step="0.01" className="w-16 text-right border rounded px-1 py-0.5 text-xs" value={slipValue(slip, 'accAbsenceHours')} onChange={e => updateSlipEdit(slip.id, 'accAbsenceHours', Number(e.target.value))} />
                          </td>
                          <td className="px-3 py-2">
                            <label className="inline-flex items-center gap-1 cursor-pointer text-xs text-primary">
                              <Upload size={12} />
                              <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleUploadSlip(slip.id, f); }} />
                              {slip.slipFilePath ? t('slipUploaded') : t('uploadSlip')}
                            </label>
                          </td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => void handleSaveSlipValues(slip)} className="text-xs font-semibold text-primary">
                              {t('saveSlip')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Passo 4 — Ciência */}
          {canManage && stepIndex >= 2 && slips.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
              <h2 className="font-bold text-slate-900">{t('stepAck')}</h2>
              <p className="text-sm text-slate-500">{t('stepAckHint')}</p>
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-800">{t('ackSigned', { count: signedCount })}</span>
                <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-800">{t('ackPending', { count: slips.length - signedCount - correctionCount })}</span>
                {correctionCount > 0 && (
                  <span className="px-2 py-1 rounded-full bg-red-50 text-red-800 inline-flex items-center gap-1">
                    <AlertCircle size={12} /> {t('ackCorrection', { count: correctionCount })}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {slips.map(slip => (
                  <div key={slip.id} className="flex flex-wrap items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2">
                    <div>
                      <p className="font-medium text-sm">{slip.employeeName || slip.employeeId}</p>
                      <p className="text-xs text-slate-500">{t(`ackStatus_${slip.acknowledgmentStatus}`)}</p>
                      {slip.correctionNotes && <p className="text-xs text-red-600 mt-1">{slip.correctionNotes}</p>}
                    </div>
                    <div className="flex gap-2">
                      {slip.acknowledgmentStatus !== 'SIGNED' && (
                        <>
                          <button type="button" onClick={() => void handleSignSlip(slip.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-semibold">
                            <PenLine size={12} /> {t('collectAck')}
                          </button>
                          <button type="button" onClick={() => void handleRequestCorrection(slip.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-semibold text-amber-800">
                            <AlertCircle size={12} /> {t('requestCorrection')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {workflowStatus === 'ACK_COLLECTING' && (
                <button type="button" onClick={() => void handleClosePeriod()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold">
                  <Lock size={14} /> {t('closePeriod')}
                </button>
              )}
            </section>
          )}

          {/* Avançado eSocial */}
          {canManage && (
            <section className="bg-slate-50 rounded-xl border border-slate-100 p-4">
              <button type="button" onClick={() => setAdvancedOpen(v => !v)} className="flex items-center gap-2 text-sm font-semibold text-slate-700 w-full">
                {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {t('advancedEsocial')}
              </button>
              {advancedOpen && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button type="button" disabled={busy || !rows.length} onClick={() => void handleExportJson()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-xs font-semibold disabled:opacity-50">
                    <FileJson size={14} /> {t('exportJson')}
                  </button>
                  <button type="button" disabled={busy || !rows.length} onClick={() => void handleExportCsv()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-xs font-semibold disabled:opacity-50">
                    <Download size={14} /> {t('exportCsv')}
                  </button>
                  <button type="button" disabled={busy || !rows.length} onClick={() => void handleXml()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-xs font-semibold disabled:opacity-50">
                    <FileCode2 size={14} /> {t('generateXml')}
                  </button>
                  <button type="button" disabled={busy || !rows.length} onClick={() => void handlePackage()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-xs font-semibold disabled:opacity-50">
                    <Package size={14} /> {t('downloadPackage')}
                  </button>
                  {lastEventId && (
                    <span className="text-xs text-slate-500 self-center">{t('lastEventId', { id: lastEventId.slice(0, 8) })}</span>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default Payroll;
