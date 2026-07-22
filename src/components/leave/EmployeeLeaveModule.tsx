
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Send, RefreshCw, X, AlertCircle, Info, Download } from 'lucide-react';
import { employeeService } from '../../services/employeeService';
import { hrService } from '../../services/hrService';
import { organizationService } from '../../services/organization.service';
import { LeaveBalance, LeaveRequest, Holiday, AppConfig, Shift, CustomLeaveType } from '../../types';
import { DEFAULT_LEAVE_TYPES } from '../../constants';
import { tStatus } from '../../i18n/statusMaps';


const getScaledLogoDims = (dataUrl: string, maxSize: number): Promise<{ w: number; h: number }> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight);
      resolve({ w: img.naturalWidth * ratio, h: img.naturalHeight * ratio });
    };
    img.onerror = () => resolve({ w: maxSize, h: maxSize });
    img.src = dataUrl;
  });

interface Props {
  user: any;
  balance: LeaveBalance | null;
  history: LeaveRequest[];
  onRefresh: () => void;
  initialOpen?: boolean;
  readOnly?: boolean;
}

const DAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

const normalizeWorkingDays = (days: string[]): string[] =>
  days.map(d => d.toUpperCase().slice(0, 3));

const resolveWorkingDays = (config: AppConfig, employeeShift: Shift | null): string[] => {
  const raw = employeeShift ? employeeShift.workingDays : (config.workingDays || []);
  return normalizeWorkingDays(raw);
};

const EmployeeLeaveModule: React.FC<Props> = ({ user, balance, history, onRefresh, initialOpen, readOnly = false }) => {
  const { t } = useTranslation('leave');
  const [showForm, setShowForm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ type: 'ANNUAL', start: '', end: '', reason: '', cid: '', certificateValidUntil: '' });
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [employeeShift, setEmployeeShift] = useState<Shift | null>(null);
  const [calculatedDays, setCalculatedDays] = useState(0);
  const [calculationDetails, setCalculationDetails] = useState<string>('');
  const [leaveTypes, setLeaveTypes] = useState<CustomLeaveType[]>(DEFAULT_LEAVE_TYPES);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  useEffect(() => {
    if (initialOpen) setShowForm(true);
    const loadMeta = async () => {
      const [hols, cfg, lt] = await Promise.all([
        hrService.getHolidays(),
        hrService.getConfig(),
        hrService.getLeaveTypes(),
      ]);
      setHolidays(hols);
      setConfig(cfg);
      setLeaveTypes(lt);
      const shift = await hrService.resolveShiftForEmployee(user.id, user.shiftId);
      setEmployeeShift(shift);
    };
    loadMeta();
  }, [initialOpen]);

  useEffect(() => {
    if (formData.start && formData.end && config) {
      const { days, details } = calculateNetDays(formData.start, formData.end);
      setCalculatedDays(days);
      setCalculationDetails(details);
    } else {
      setCalculatedDays(0);
      setCalculationDetails('');
    }
  }, [formData.start, formData.end, config, holidays, employeeShift]);

  const calculateNetDays = (startStr: string, endStr: string) => {
    if (!config) return { days: 0, details: '' };
    const workingDays = resolveWorkingDays(config, employeeShift);
    let count = 0;
    let weekendsFound = 0;
    let holidaysFound = 0;
    const cur = new Date(startStr);
    const stop = new Date(endStr);

    if (cur > stop) return { days: 0, details: t('invalidDateRange') };

    const iterator = new Date(cur);
    while (iterator <= stop) {
      const dayKey = DAY_KEYS[iterator.getDay()];
      const dateStr = iterator.toISOString().split('T')[0];
      const isWorkDay = workingDays.includes(dayKey);
      const isPublicHoliday = holidays.some(h => h.date === dateStr);

      if (!isWorkDay) weekendsFound++;
      else if (isPublicHoliday) holidaysFound++;
      else count++;
      iterator.setDate(iterator.getDate() + 1);
    }

    const detailParts: string[] = [];
    if (weekendsFound > 0) detailParts.push(t('weekendsExcluded', { count: weekendsFound }));
    if (holidaysFound > 0) detailParts.push(t('holidaysExcluded', { count: holidaysFound }));
    return { days: count, details: detailParts.join(' ') };
  };

  const getAvailableBalance = (type: string) => {
    if (!balance) return 0;
    return (balance[type] as number) || 0;
  };

  const generateLeavePdf = async (req: LeaveRequest) => {
    setGeneratingPdfId(req.id);
    try {
      // Fetch org info
      let orgName = '', orgAddress = '', logoDataUrl: string | null = null;
      try {
        const branding = await organizationService.getOrgBranding();
        orgName = branding.name;
        orgAddress = branding.address;
        logoDataUrl = branding.logoDataUrl;
      } catch { /* proceed without org info */ }

      // Fetch manager name
      let managerName = 'N/A';
      try {
        if (req.lineManagerId) {
          const employees = await employeeService.getEmployees();
          const mgr = employees.find(e => e.id === req.lineManagerId);
          managerName = mgr?.name || 'N/A';
        }
      } catch { /* proceed with N/A */ }

      const jsPDFModule = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
      if (autoTableModule.applyPlugin) autoTableModule.applyPlugin(jsPDF);

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 15;

      // Header: logo + org name + address
      const logoSize = 18;
      let textStartX = 14;
      if (logoDataUrl) {
        try {
          const logoDims = await getScaledLogoDims(logoDataUrl, logoSize);
          doc.addImage(logoDataUrl, 'PNG', 14, y - 4, logoDims.w, logoDims.h);
          textStartX = 14 + logoDims.w + 5;
        } catch { /* skip logo */ }
      }
      if (orgName) {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(orgName, textStartX, y + 2);
        if (orgAddress) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(orgAddress, textStartX, y + 8);
        }
      }
      y += 20;

      // HR line
      doc.setDrawColor(200);
      doc.setLineWidth(0.5);
      doc.line(14, y, pageWidth - 14, y);
      y += 12;

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Leave Application', pageWidth / 2, y, { align: 'center' });
      y += 14;

      // Helper for sections
      const drawSection = (title: string, rows: [string, string][]) => {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 80);
        doc.text(title, 14, y);
        y += 2;
        doc.setDrawColor(220);
        doc.line(14, y, pageWidth - 14, y);
        y += 6;

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        rows.forEach(([label, value]) => {
          doc.setFont('helvetica', 'bold');
          doc.text(label + ':', 18, y);
          doc.setFont('helvetica', 'normal');
          const lines = doc.splitTextToSize(value || 'N/A', pageWidth - 70);
          doc.text(lines, 65, y);
          y += lines.length * 5 + 2;
        });
        y += 4;
      };

      // Applicant Info
      drawSection('Applicant Information', [
        ['Name', user.name || ''],
        ['Employee ID', user.employeeId || ''],
        ['Department', user.department || ''],
        ['Designation', user.designation || ''],
      ]);

      // Leave Details
      drawSection('Leave Details', [
        ['Type', req.type],
        ['Start Date', req.startDate],
        ['End Date', req.endDate],
        ['Total Days', String(req.totalDays)],
        ['Reason', req.reason || ''],
      ]);

      // Approval Status
      const statusLabel = req.status.replace('_', ' ');
      drawSection('Approval Status', [
        ['Status', statusLabel],
        ['Manager', managerName],
        ['Manager Remarks', req.managerRemarks || 'N/A'],
        ['Approver Remarks', req.approverRemarks || 'N/A'],
        ['Applied Date', req.appliedDate || ''],
      ]);

      // Signature lines at bottom
      const sigY = Math.max(y + 20, 250);
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      // Employee signature
      doc.line(25, sigY, 90, sigY);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Employee Signature', 35, sigY + 5);
      doc.setFont('helvetica', 'bold');
      doc.text(user.name || '', 40, sigY + 10);
      // Manager signature
      doc.line(pageWidth - 90, sigY, pageWidth - 25, sigY);
      doc.setFont('helvetica', 'normal');
      doc.text('Manager/Approver Signature', pageWidth - 85, sigY + 5);
      doc.setFont('helvetica', 'bold');
      doc.text(managerName, pageWidth - 70, sigY + 10);

      doc.save(`Leave_Application_${req.type}_${req.startDate}.pdf`);
    } catch (err) {
      console.error('Failed to generate leave PDF', err);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const getLeaveTypeName = (typeId: string) =>
    leaveTypes.find(lt => lt.id === typeId)?.name || typeId;

  const balanceTypes = leaveTypes.filter(lt => lt.hasBalance);

  const isSickLeave = formData.type === 'SICK';

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setAttachmentFile(null);
      return;
    }
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isImage && !isPdf) {
      setError(t('attachmentTypeError'));
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t('attachmentTooLarge'));
      e.target.value = '';
      return;
    }
    setError(null);
    setAttachmentFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);

    if (calculatedDays <= 0) {
      setError(t('netDurationZero'));
      setIsProcessing(false);
      return;
    }
    const currentAvailable = getAvailableBalance(formData.type);
    if (calculatedDays > currentAvailable) {
      setError(t('insufficientBalance', { count: currentAvailable }));
      setIsProcessing(false);
      return;
    }

    try {
      await employeeService.applyForLeave({
        type: formData.type as any,
        startDate: formData.start,
        endDate: formData.end,
        totalDays: calculatedDays,
        reason: formData.reason,
        cid: isSickLeave && formData.cid ? formData.cid : undefined,
        certificateValidUntil: isSickLeave && formData.certificateValidUntil ? formData.certificateValidUntil : undefined,
      }, user, isSickLeave ? attachmentFile ?? undefined : undefined);
      setShowForm(false);
      setFormData({ type: leaveTypes[0]?.id || 'ANNUAL', start: '', end: '', reason: '', cid: '', certificateValidUntil: '' });
      setAttachmentFile(null);
      onRefresh();
    } catch (err: any) {
      const msg = err.message === 'ATTACHMENT_TOO_LARGE'
        ? t('attachmentTooLarge')
        : err.message === 'ATTACHMENT_INVALID_TYPE'
          ? t('attachmentTypeError')
          : (err.message || t('submissionFailed'));
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-slate-900">{t('personalDashboard')}</h3>
        <button
          onClick={() => setShowForm(true)}
          disabled={readOnly}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold uppercase tracking-widest text-[10px] shadow-xl transition-all ${
            readOnly
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-primary text-white hover:bg-primary-hover'
          }`}
        >
          <Plus size={18} /> {t('apply')}
        </button>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${['','md:grid-cols-1','md:grid-cols-2','md:grid-cols-3','md:grid-cols-4'][Math.min(balanceTypes.length, 4)] || 'md:grid-cols-4'}`}>
        {balanceTypes.map(lt => (
          <div key={lt.id} className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center gap-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{lt.name}</p>
            <p className="text-4xl font-semibold text-primary">{getAvailableBalance(lt.id)}</p>
            <p className="text-[9px] font-bold text-slate-300 uppercase">{t('daysRemaining')}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 p-8">
        <h4 className="font-semibold text-slate-900 mb-6 uppercase tracking-widest text-xs text-slate-400">{t('applicationHistory')}</h4>
        <div className="space-y-3">
          {history.map(req => (
            <div key={req.id} className="p-5 rounded-3xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white hover:shadow-md transition-all group">
              <div className="flex items-center gap-4">
                 <div className={`w-2 h-12 rounded-full flex-shrink-0 ${req.status === 'APPROVED' ? 'bg-emerald-500' : req.status === 'REJECTED' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                 <div>
                    <h4 className="font-semibold text-slate-800 text-sm uppercase leading-tight">{getLeaveTypeName(req.type)}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{req.startDate} — {req.endDate}</p>
                 </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-3 py-1 rounded-lg text-[9px] font-semibold uppercase whitespace-nowrap ${req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : req.status === 'REJECTED' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                    {tStatus('leave', req.status)}
                  </span>
                  <p className="text-[10px] font-bold text-slate-400">{t('dayCount', { count: req.totalDays })}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); generateLeavePdf(req); }}
                  disabled={generatingPdfId === req.id}
                  className="p-2 rounded-xl text-slate-400 hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
                  title={t('downloadPdf')}
                >
                  {generatingPdfId === req.id ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                </button>
              </div>
            </div>
          ))}
          {history.length === 0 && <p className="text-center text-slate-400 text-xs font-semibold uppercase tracking-widest py-8">{t('noApplicationsFound')}</p>}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in">
            <div className="p-8 bg-primary text-white flex justify-between items-center">
              <h3 className="text-lg font-semibold uppercase tracking-tight">{t('newLeaveRequest')}</h3>
              <button onClick={() => setShowForm(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              {error && <div className="p-4 bg-rose-50 text-rose-700 text-xs font-bold rounded-2xl flex gap-2"><AlertCircle size={16}/>{error}</div>}

              <div className="space-y-1">
                 <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('type')}</label>
                 <select className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-semibold text-sm outline-none" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                    {leaveTypes.filter(lt => lt.hasBalance).map(lt => (
                      <option key={lt.id} value={lt.id}>{lt.name}</option>
                    ))}
                 </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 min-w-0">
                   <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('startDate')}</label>
                   <input type="date" required className="w-full min-w-0 px-3 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none" value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} />
                </div>
                <div className="space-y-1 min-w-0">
                   <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('endDate')}</label>
                   <input type="date" required className="w-full min-w-0 px-3 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none" value={formData.end} onChange={e => setFormData({...formData, end: e.target.value})} />
                </div>
              </div>

              {formData.start && formData.end && (
                 <div className={`p-4 border rounded-2xl flex items-center gap-3 ${calculatedDays > getAvailableBalance(formData.type) ? 'bg-rose-50 border-rose-100' : 'bg-primary-light border-primary-light'}`}>
                    <Info size={18} className={calculatedDays > getAvailableBalance(formData.type) ? 'text-rose-500' : 'text-primary'} />
                    <div>
                       <p className={`font-semibold text-xs ${calculatedDays > getAvailableBalance(formData.type) ? 'text-rose-900' : 'text-primary'}`}>{t('netDays', { count: calculatedDays })}</p>
                       <p className="text-[9px] font-bold text-slate-500">{calculationDetails}</p>
                    </div>
                 </div>
              )}

              <div className="space-y-1">
                 <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('reason')}</label>
                 <textarea required placeholder={t('reasonPlaceholder')} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm min-h-[100px] outline-none" value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} />
              </div>

              {isSickLeave && (
                <div className="space-y-4 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{t('medicalCertificateSection')}</p>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('cid')}</label>
                    <input
                      type="text"
                      placeholder={t('cidPlaceholder')}
                      className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none"
                      value={formData.cid}
                      onChange={e => setFormData({ ...formData, cid: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('certificateValidUntil')}</label>
                    <input
                      type="date"
                      className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none"
                      value={formData.certificateValidUntil}
                      onChange={e => setFormData({ ...formData, certificateValidUntil: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('attachment')}</label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleAttachmentChange}
                      className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-primary/10 file:text-primary"
                    />
                    <p className="text-[9px] text-slate-400 px-1">{t('attachmentHint')}</p>
                  </div>
                </div>
              )}

              <button type="submit" disabled={isProcessing || calculatedDays > getAvailableBalance(formData.type)} className="w-full py-5 bg-primary text-white rounded-xl font-semibold uppercase tracking-widest text-[10px] shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-primary-hover transition-all">
                 {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <Send size={16} />} {t('submitApplication')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeLeaveModule;
