import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { User, Employee } from '../types';
import { EmployeeOnboardingWizard } from '../components/employees/EmployeeOnboardingWizard';
import { EmployeeProfilePanel } from '../components/employees/EmployeeProfilePanel';
import { needsClockAdmission } from '../utils/roles';

interface Props {
  user: User;
  mode: 'create' | 'edit' | 'view';
  employeeId?: string;
  onNavigate: (path: string, params?: { employeeId?: string }) => void;
}

const EmployeeOnboarding: React.FC<Props> = ({ user, mode, employeeId, onNavigate }) => {
  const { t } = useTranslation('employees');

  const title =
    mode === 'create'
      ? t('onboarding.titleCreate')
      : mode === 'edit'
        ? t('onboarding.titleEdit')
        : t('personnelProfile');

  const handleDone = (employee?: Employee) => {
    if (mode === 'create' && employee && needsClockAdmission(employee.role)) {
      onNavigate('employee-admission', { employeeId: employee.id });
      return;
    }
    onNavigate('employees');
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <button
        type="button"
        onClick={() => onNavigate('employees')}
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        {t('onboarding.backToDirectory')}
      </button>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>

      {mode === 'view' && employeeId ? (
        <EmployeeProfilePanel
          user={user}
          employeeId={employeeId}
          onEdit={() => onNavigate('employee-edit', { employeeId })}
        />
      ) : (
        <EmployeeOnboardingWizard
          user={user}
          mode={mode === 'edit' ? 'edit' : 'create'}
          employeeId={employeeId}
          onCancel={() => onNavigate('employees')}
          onDone={handleDone}
        />
      )}
    </div>
  );
};

export default EmployeeOnboarding;
