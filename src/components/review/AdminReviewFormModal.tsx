import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Send, RefreshCw, AlertCircle, UserPlus, Edit3 } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { PerformanceReview, ReviewCycle, ReviewStatus } from '../../types';
import { tStatus } from '../../i18n/statusMaps';

interface Employee {
  id: string;
  name: string;
  department: string;
}

interface Props {
  mode: 'create' | 'edit';
  review?: PerformanceReview | null;
  employees: Employee[];
  cycles: ReviewCycle[];
  onClose: () => void;
  onSaved: () => void;
}

const REVIEW_STATUS_VALUES: ReviewStatus[] = [
  'DRAFT',
  'SELF_REVIEW_SUBMITTED',
  'MANAGER_REVIEWED',
  'COMPLETED',
];

const AdminReviewFormModal: React.FC<Props> = ({ mode, review, employees, cycles, onClose, onSaved }) => {
  const { t } = useTranslation('review');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState(review?.employeeId || '');
  const [cycleId, setCycleId] = useState(review?.cycleId || (cycles.length > 0 ? cycles[0].id : ''));
  const [lineManagerId, setLineManagerId] = useState(review?.lineManagerId || '');
  const [status, setStatus] = useState<ReviewStatus>(review?.status || 'DRAFT');

  const selectedEmployee = employees.find(e => e.id === employeeId);
  const selectedManager = employees.find(e => e.id === lineManagerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'create') {
      if (!employeeId) { setError(t('selectEmployeeError')); return; }
      if (!cycleId) { setError(t('selectCycleError')); return; }
    }

    setIsProcessing(true);
    try {
      if (mode === 'create') {
        await hrService.createReview(
          cycleId,
          employeeId,
          selectedEmployee?.name || '',
          lineManagerId || undefined,
          selectedManager?.name || undefined,
        );
      } else if (review) {
        await hrService.adminUpdateReview(review.id, {
          lineManagerId,
          managerName: selectedManager?.name || '',
          status,
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || t('operationFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const headerColor = mode === 'create' ? 'bg-primary' : 'bg-amber-600';
  const HeaderIcon = mode === 'create' ? UserPlus : Edit3;
  const headerTitle = mode === 'create' ? t('createReviewAdmin') : t('editReviewAdmin');
  const submitLabel = mode === 'create' ? t('createReview') : t('saveChanges');

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
          {mode === 'edit' && review && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{t('employee')}</p>
              <p className="text-sm font-semibold text-slate-800 mt-1">{review.employeeName}</p>
            </div>
          )}

          {/* Review Cycle (create only) */}
          {mode === 'create' && (
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('reviewCycle')}</label>
              <select
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-semibold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all"
                value={cycleId}
                onChange={e => setCycleId(e.target.value)}
              >
                <option value="">{t('selectCyclePlaceholder')}</option>
                {cycles.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Line Manager */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('lineManager')}</label>
            <select
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-semibold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all"
              value={lineManagerId}
              onChange={e => setLineManagerId(e.target.value)}
            >
              <option value="">{t('noManagerPlaceholder')}</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.department})</option>
              ))}
            </select>
          </div>

          {/* Status (edit only) */}
          {mode === 'edit' && (
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('status')}</label>
              <select
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-semibold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all"
                value={status}
                onChange={e => setStatus(e.target.value as ReviewStatus)}
              >
                {REVIEW_STATUS_VALUES.map(s => (
                  <option key={s} value={s}>{tStatus('review', s)}</option>
                ))}
              </select>
            </div>
          )}

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

export default AdminReviewFormModal;
