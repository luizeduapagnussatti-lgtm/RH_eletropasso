import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit, Loader2 } from 'lucide-react';
import { User, Employee } from '../../types';
import { hrService } from '../../services/hrService';
import { tRole } from '../../i18n/statusMaps';
import { formatCpfDisplay, formatPisDisplay, formatClockCredentialDisplay, resolveClockCredential } from '../../utils/employeeCredentials';
import { needsClockAdmission, canManageEmployeeRecord } from '../../utils/roles';
import { ClockOnboardingPanel } from './ClockOnboardingPanel';

interface Props {
  user: User;
  employeeId: string;
  onEdit: () => void;
}

export const EmployeeProfilePanel: React.FC<Props> = ({ user, employeeId, onEdit }) => {
  const { t } = useTranslation('employees');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [shiftName, setShiftName] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [list, shifts] = await Promise.all([
        hrService.getEmployees(),
        hrService.getShifts().catch(() => []),
      ]);
      const emp = list.find(e => e.id === employeeId) || null;
      setEmployee(emp);
      if (emp?.shiftId) {
        setShiftName(shifts.find(s => s.id === emp.shiftId)?.name || t('unknownShift'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [employeeId]);

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (!employee) {
    return <p className="text-slate-500">{t('noEmployees')}</p>;
  }

  const canEdit = canManageEmployeeRecord(user.role, employee.role);

  const rows = [
    [t('officialEmployeeId'), formatPisDisplay(employee.employeeId) || t('notAvailable')],
    [
      t('clockCredential'),
      formatClockCredentialDisplay(
        resolveClockCredential(employee.clockCredential, employee.employeeId)
      ) || t('notAvailable'),
    ],
    [t('onboarding.cpf'), employee.cpf ? formatCpfDisplay(employee.cpf) : t('notAvailable')],
    [t('workEmail'), employee.email],
    [t('accessLevel'), tRole(employee.role)],
    [t('department'), employee.department],
    [t('designation'), employee.designation],
    [t('assignedShift'), shiftName || t('noShiftAssigned')],
    [t('joiningDate'), employee.joiningDate || t('notAvailable')],
    [t('terminationDate'), employee.terminationDate || t('notAvailable')],
    [t('onboarding.mobile'), employee.mobile || t('notAvailable')],
    [t('status'), t(employee.status === 'ACTIVE' ? 'active' : 'inactive')],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          {employee.avatar ? (
            <img src={employee.avatar} alt="" className="w-16 h-16 rounded-2xl object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-xl font-bold text-slate-400">
              {(employee.name || '?')[0]}
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{employee.name}</h2>
            <p className="text-sm text-slate-500">{employee.email}</p>
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium"
          >
            <Edit size={16} />
            {t('modifyAccount')}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-medium text-slate-800 dark:text-slate-100 text-right">{value}</span>
          </div>
        ))}
      </div>

      {needsClockAdmission(employee.role) && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <ClockOnboardingPanel employee={employee} onRefresh={load} compact />
        </div>
      )}
    </div>
  );
};
