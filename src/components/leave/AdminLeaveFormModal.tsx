
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Send, RefreshCw, AlertCircle, UserPlus, Edit3 } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { LeaveRequest, CustomLeaveType } from '../../types';
import { DEFAULT_LEAVE_TYPES } from '../../constants';
import { tStatus } from '../../i18n/statusMaps';

interface Employee {
  id: string;
  name: string;
  department: string;
}

interface Props {
  mode: 'create' | 'edit';
  leave?: LeaveRequest | null;
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS = ['APPROVED', 'PENDING_MANAGER', 'PENDING_HR', 'REJECTED'];

const AdminLeaveFormModal: React.FC<Props> = ({ mode, leave, employees, onClose, onSaved }) => {
  const { t } = useTranslation('leave');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaveTypes, setLeaveTypes] = useState<CustomLeaveType[]>(DEFAULT_LEAVE_TYPES);

  const [employeeId, setEmployeeId] = useState(leave?.employeeId || '');
  const [type, setType] = useState<string>(leave?.type || 'ANNUAL');
  const [startDate, setStartDate] = useState(leave?.startDate?.split(' ')[0] || '');
  const [endDate, setEndDate] = useState(leave?.endDate?.split(' ')[0] || '');
  const [reason, setReason] = useState(leave?.reason || '');
  const [status, setStatus] = useState<string>(leave?.status || 'APPROVED');
  const [remarks, setRemarks] = useState(leave?.approverRemarks || '');
  const [totalDays, setTotalDays] = useState(leave?.totalDays || 0);
  const [cid, setCid] = useState(leave?.cid || '');
  const [certificateValidUntil, setCertificateValidUntil] = useState(leave?.certificateValidUntil?.split(' ')[0] || '');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const isSickLeave = type === 'SICK';

  useEffect(() => {
    hrService.getLeaveTypes().then(setLeaveTypes).catch((err) => {
      console.error('Failed to load leave types:', err);
    });
  }, []);

  // Auto-calc total days (simple calendar diff — admin can override)
  useEffect(() => {
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (e >= s) {
        const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        setTotalDays(diff);
      }
    }
  }, [startDate, endDate]);

  const selectedEmployee = employees.find(e => e.id === employeeId);

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
    setError(null);

    if (mode === 'create' && !employeeId) {
      setError(t('selectEmployee'));
      return;
    }
    if (!startDate || !endDate) {
      setError(t('selectDates'));
      return;
    }
    if (totalDays <= 0) {
      setError(t('totalDaysMustBePositive'));
      return;
    }

    setIsProcessing(true);
    try {
      const medicalFields = isSickLeave ? {
        cid: cid || undefined,
        certificateValidUntil: certificateValidUntil || undefined,
      } : {};

      if (mode === 'create') {
        await hrService.adminCreateLeave({
          employeeId,
          employeeName: selectedEmployee?.name || '',
          type,
          startDate,
          endDate,
          totalDays,
          reason,
          status,
          remarks,
          ...medicalFields,
        }, isSickLeave ? attachmentFile ?? undefined : undefined);
      } else if (leave) {
        await hrService.adminUpdateLeave(leave.id, {
          type,
          startDate,
          endDate,
          totalDays,
          reason,
          status,
          approverRemarks: remarks,
          employeeId: leave.employeeId,
          ...medicalFields,
        }, isSickLeave ? attachmentFile ?? undefined : undefined);
      }
      onSaved();
    } catch (err: any) {
      const msg = err.message === 'ATTACHMENT_TOO_LARGE'
        ? t('attachmentTooLarge')
        : err.message === 'ATTACHMENT_INVALID_TYPE'
          ? t('attachmentTypeError')
          : (err.message || t('operationFailed'));
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const headerColor = mode === 'create' ? 'bg-primary' : 'bg-amber-600';
  const HeaderIcon = mode === 'create' ? UserPlus : Edit3;
  const headerTitle = mode === 'create' ? t('createLeaveAdmin') : t('editLeaveAdmin');
  const submitLabel = mode === 'create' ? t('createLeave') : t('saveChanges');

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in max-h-[90vh] flex flex-col">
        <div className={`p-8 ${headerColor} text-white flex justify-between items-center flex-shrink-0`}>
          <div className="flex items-center gap-3">
            <HeaderIcon size={20} />
            <h3 className="text-lg font-semibold uppercase tracking-tight">{headerTitle}</h3>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-lg transition-colors"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-4 bg-rose-50 text-rose-700 text-xs font-bold rounded-2xl flex gap-2 items-start">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{error}
            </div>
          )}

          {/* Employee Selector (create only) */}
          {mode === 'create' && (
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('employee')}</label>
              <select
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-semibold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all"
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
              >
                <option value="">{t('selectEmployeePlaceholder')}</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.department})</option>
                ))}
              </select>
            </div>
          )}

          {/* Edit mode: show employee name as read-only */}
          {mode === 'edit' && leave && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{t('employee')}</p>
              <p className="text-sm font-semibold text-slate-800 mt-1">{leave.employeeName}</p>
            </div>
          )}

          {/* Leave Type */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('type')}</label>
            <select
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-semibold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all"
              value={type}
              onChange={e => setType(e.target.value)}
            >
              {leaveTypes.map(lt => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('startDate')}</label>
              <input type="date" required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('endDate')}</label>
              <input type="date" required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Total Days (auto-calculated, editable override) */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('totalDays')}</label>
            <input type="number" min={0} step={0.5} required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all" value={totalDays} onChange={e => setTotalDays(Number(e.target.value))} />
          </div>

          {/* Reason */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('reason')}</label>
            <textarea placeholder={t('reasonPlaceholder')} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm min-h-[80px] outline-none focus:ring-4 focus:ring-primary-light transition-all" value={reason} onChange={e => setReason(e.target.value)} />
          </div>

          {isSickLeave && (
            <div className="space-y-4 p-5 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{t('medicalCertificateSection')}</p>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('cid')}</label>
                <input
                  type="text"
                  placeholder={t('cidPlaceholder')}
                  className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all"
                  value={cid}
                  onChange={e => setCid(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('certificateValidUntil')}</label>
                <input
                  type="date"
                  className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all"
                  value={certificateValidUntil}
                  onChange={e => setCertificateValidUntil(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('attachment')}</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleAttachmentChange}
                  className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-primary/10 file:text-primary"
                />
                <p className="text-[9px] text-slate-400 px-1">{t('attachmentHint')}</p>
                {mode === 'edit' && leave?.attachmentPath && !attachmentFile && (
                  <p className="text-[9px] font-bold text-emerald-600 px-1">{t('attachmentOnFile')}</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('statusLabel')}</label>
            <select
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-semibold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{tStatus('leave', s)}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('adminRemarksLabel')}</label>
            <textarea placeholder={t('adminNotesPlaceholder')} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm min-h-[60px] outline-none focus:ring-4 focus:ring-primary-light transition-all" value={remarks} onChange={e => setRemarks(e.target.value)} />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isProcessing}
            className={`w-full py-5 ${headerColor} text-white rounded-xl font-semibold uppercase tracking-widest text-[10px] shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-all`}
          >
            {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <Send size={16} />} {submitLabel}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLeaveFormModal;
