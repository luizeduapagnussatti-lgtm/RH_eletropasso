import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { Employee, User } from '../types';
import { hrService } from '../services/hrService';
import { useToast } from '../context/ToastContext';
import {
  canManageEmployeeRecord,
  isStaffAdmin,
  needsClockAdmission,
} from '../utils/roles';
import { DmprepLifecyclePanel } from '../components/employees/DmprepLifecyclePanel';
import { ClockOnboardingPanel } from '../components/employees/ClockOnboardingPanel';

interface Props {
  user: User;
  mode: 'admission' | 'discharge';
  employeeId?: string;
  onNavigate: (path: string, params?: { employeeId?: string }) => void;
}

/**
 * Full-page admission (post-create) or discharge (pre-delete) lifecycle.
 * Closes the clock/DMPREP cycle outside the Equipe grid overlay.
 */
const EmployeeLifecyclePage: React.FC<Props> = ({ user, mode, employeeId, onNavigate }) => {
  const { t } = useTranslation('employees');
  const { showToast } = useToast();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simpleConfirming, setSimpleConfirming] = useState(false);

  const goDirectory = () => onNavigate('employees');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!employeeId) {
        setError(t('lifecycle.missingId'));
        setLoading(false);
        return;
      }
      if (!isStaffAdmin(user.role)) {
        setError(t('lifecycle.forbidden'));
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const list = await hrService.getEmployees();
        const found = list.find(e => e.id === employeeId) || null;
        if (!found) {
          if (!cancelled) setError(t('lifecycle.notFound'));
        } else if (!canManageEmployeeRecord(user.role, found.role)) {
          if (!cancelled) setError(t('cannotEditAdmin'));
        } else if (!cancelled) {
          setEmployee(found);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t('operationFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId, user.role, t]);

  const refreshEmployee = async () => {
    if (!employeeId) return;
    const list = await hrService.getEmployees();
    const fresh = list.find(e => e.id === employeeId) || null;
    setEmployee(fresh);
  };

  const confirmDischarge = async () => {
    if (!employee) return;
    if (needsClockAdmission(employee.role) && employee.employeeId) {
      await hrService.updateProfile(employee.id, { status: 'INACTIVE' }).catch(() => {});
      try {
        await hrService.triggerDmprepSync('export-employee-discharge', employee.id);
      } catch {
        /* best-effort */
      }
    }
    await hrService.deleteEmployee(employee.id);
    showToast(t('dmprepChecklist.dischargeComplete', { name: employee.name }), 'success');
    goDirectory();
  };

  const title =
    mode === 'admission'
      ? t('dmprepChecklist.admissionTitle')
      : t('dmprepChecklist.dischargeTitle');

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <button
          type="button"
          onClick={goDirectory}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          {t('onboarding.backToDirectory')}
        </button>
        <p className="text-sm text-rose-600" role="alert">
          {error || t('lifecycle.notFound')}
        </p>
      </div>
    );
  }

  const punchKey = employee.employeeId || undefined;
  const clockRole = needsClockAdmission(employee.role);

  // Non-punching accounts: simple delete confirm (no fingerprint checklist)
  if (mode === 'discharge' && !clockRole) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <button
          type="button"
          onClick={goDirectory}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          {t('onboarding.backToDirectory')}
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('lifecycle.simpleDischargeTitle')}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('lifecycle.simpleDischargeHint', { name: employee.name, role: employee.role })}
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={goDirectory}
            className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold"
          >
            {t('dmprepChecklist.cancelDischarge')}
          </button>
          <button
            type="button"
            disabled={simpleConfirming}
            onClick={() => {
              setSimpleConfirming(true);
              void confirmDischarge().finally(() => setSimpleConfirming(false));
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
          >
            <Trash2 size={16} />
            {simpleConfirming ? t('dmprepChecklist.confirming') : t('dmprepChecklist.confirmDischarge')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <button
        type="button"
        onClick={goDirectory}
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        {t('onboarding.backToDirectory')}
      </button>
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t('dmprepChecklist.subtitle', { name: employee.name })}
        </p>
        {mode === 'admission' ? (
          <p className="text-xs text-slate-400 mt-1">{t('lifecycle.admissionPageHint')}</p>
        ) : (
          <p className="text-xs text-slate-400 mt-1">{t('lifecycle.dischargePageHint')}</p>
        )}
      </div>

      {mode === 'discharge' ? (
        <DmprepLifecyclePanel
          type="discharge"
          employeeName={employee.name}
          punchKey={punchKey}
          onCancel={goDirectory}
          onConfirm={confirmDischarge}
        />
      ) : (
        <DmprepLifecyclePanel
          type="admission"
          employeeName={employee.name}
          punchKey={punchKey}
          onCancel={goDirectory}
        >
          <ClockOnboardingPanel
            employee={employee}
            onRefresh={refreshEmployee}
            onComplete={goDirectory}
          />
        </DmprepLifecyclePanel>
      )}
    </div>
  );
};

export default EmployeeLifecyclePage;
