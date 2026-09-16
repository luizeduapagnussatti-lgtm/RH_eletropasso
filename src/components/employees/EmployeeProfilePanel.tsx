import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit, Key, Loader2, X } from 'lucide-react';
import { User, Employee, Team } from '../../types';
import { hrService } from '../../services/hrService';
import { organizationService } from '../../services/organization.service';
import { tRole } from '../../i18n/statusMaps';
import { formatCpfDisplay, formatPisDisplay, formatClockCredentialDisplay } from '../../utils/employeeCredentials';
import { needsClockAdmission, canManageEmployeeRecord } from '../../utils/roles';
import { isInternalAuthEmail, isUsableLoginEmail } from '../../utils/emailUtils';
import { ClockOnboardingPanel } from './ClockOnboardingPanel';
import { labelEmploymentType, labelWorkType } from './EmployeeOnboardingSteps';
import { useToast } from '../../context/ToastContext';

interface Props {
  user: User;
  employeeId: string;
  onEdit: () => void;
}

export const EmployeeProfilePanel: React.FC<Props> = ({ user, employeeId, onEdit }) => {
  const { t } = useTranslation('employees');
  const { showToast } = useToast();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [shiftName, setShiftName] = useState('');
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [list, shifts, teamList] = await Promise.all([
        hrService.getEmployees(),
        hrService.getShifts().catch(() => []),
        organizationService.getTeams().catch(() => []),
      ]);
      const emp = list.find(e => e.id === employeeId) || null;
      setEmployee(emp);
      setEmployees(list || []);
      setTeams(teamList || []);
      if (emp?.shiftId) {
        setShiftName(shifts.find(s => s.id === emp.shiftId)?.name || t('unknownShift'));
      } else {
        setShiftName('');
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
  const team = teams.find(x => x.id === employee.teamId);
  const manager = employees.find(x => x.id === employee.lineManagerId);
  const credentialDisplay = needsClockAdmission(employee)
    ? (formatClockCredentialDisplay(employee.clockCredential) || t('notAvailable'))
    : t('clockCredentialNotApplicable');

  const rows = [
    [t('onboarding.cpf'), employee.cpf ? formatCpfDisplay(employee.cpf) : t('notAvailable')],
    [t('officialEmployeeId'), formatPisDisplay(employee.employeeId) || t('notAvailable')],
    [t('clockCredential'), credentialDisplay],
    ...(needsClockAdmission(employee)
      ? [[
          t('clockBiometricRegistered'),
          employee.clockBiometricRegistered ? t('clockBiometricOk') : t('clockBiometricPending'),
        ] as [string, string]]
      : []),
    [t('joiningDate'), employee.joiningDate || t('notAvailable')],
    [t('terminationDate'), employee.terminationDate || t('notAvailable')],
    [t('onboarding.mobile'), employee.mobile || t('notAvailable')],
    [t('onboarding.whatsappOptInShort'), employee.whatsappOptIn ? t('yes', { ns: 'common' }) : t('no', { ns: 'common' })],
    [t('onboarding.emergencyContact'), employee.emergencyContact || t('notAvailable')],
    [t('onboarding.employmentType'), labelEmploymentType(t, employee.employmentType)],
    [t('workType'), labelWorkType(t, employee.workType)],
    [t('onboarding.allowPwaPunch'), employee.allowPwaPunch ? t('yes', { ns: 'common' }) : t('no', { ns: 'common' })],
    [t('onboarding.location'), employee.location || t('notAvailable')],
    [t('department'), employee.department || t('unassigned')],
    [t('designation'), employee.designation || t('unassigned')],
    [t('assignedTeam'), team?.name || t('noTeamAssigned')],
    [t('lineManager'), manager?.name || t('notAvailable')],
    [t('assignedShift'), shiftName || t('noShiftAssigned')],
    [t('workEmail'), employee.email],
    [t('accessLevel'), tRole(employee.role)],
    [t('status'), t(employee.status === 'ACTIVE' ? 'active' : 'inactive')],
  ];

  const handleResetPassword = async () => {
    const pwd = newPassword.trim();
    if (pwd.length < 8) {
      showToast(t('onboarding.errors.passwordShort'), 'error');
      return;
    }
    const needsLoginEmail = isInternalAuthEmail(employee.email);
    const nextEmail = needsLoginEmail ? loginEmail.trim().toLowerCase() : '';
    if (needsLoginEmail && !isUsableLoginEmail(nextEmail)) {
      showToast(t('onboarding.errors.passwordNeedsRealEmail'), 'error');
      return;
    }
    setResetBusy(true);
    try {
      await hrService.updateProfile(employee.id, {
        password: pwd,
        ...(nextEmail ? { email: nextEmail } : {}),
      });
      showToast(t('passwordResetSuccess', { name: employee.name }), 'success');
      setResetOpen(false);
      setNewPassword('');
      setLoginEmail('');
      await load();
    } catch (e: any) {
      console.error(e);
      const code = String(e?.message || '');
      const byCode: Record<string, string> = {
        PLACEHOLDER_EMAIL: 'onboarding.errors.passwordNeedsRealEmail',
        ACCESS_FORBIDDEN: 'onboarding.errors.accessForbidden',
        EMAIL_ACTIVE_CONFLICT: 'onboarding.errors.emailActiveConflict',
        EMAIL_AUTH_CONFLICT: 'onboarding.errors.emailAuthConflict',
        PASSWORD_SHORT: 'onboarding.errors.passwordShort',
        AUTH_UPDATE: 'onboarding.errors.authUpdate',
      };
      showToast(byCode[code] ? t(byCode[code]) : (e?.message || t('operationFailed')), 'error');
    } finally {
      setResetBusy(false);
    }
  };

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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm font-medium dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <Key size={16} />
              {t('resetPassword')}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium"
            >
              <Edit size={16} />
              {t('modifyAccount')}
            </button>
          </div>
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

      {needsClockAdmission(employee) && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <ClockOnboardingPanel employee={employee} onRefresh={load} compact />
        </div>
      )}

      {resetOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t('resetPassword')}</h3>
              <button
                type="button"
                onClick={() => { setResetOpen(false); setNewPassword(''); setLoginEmail(''); }}
                className="text-slate-400"
                aria-label={t('cancel')}
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-500">
              {t('resetPasswordHint', { name: employee.name, email: employee.email })}
            </p>
            {isInternalAuthEmail(employee.email) && (
              <label className="block">
                <span className="text-xs font-semibold text-slate-500 uppercase">{t('workEmail')}</span>
                <input
                  type="email"
                  autoComplete="off"
                  className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder={t('onboarding.emailLoginPlaceholder')}
                />
                <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">{t('onboarding.placeholderEmailWarning')}</p>
              </label>
            )}
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase">{t('setLoginPassword')}</span>
              <input
                type="password"
                minLength={8}
                autoComplete="new-password"
                className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder={t('setLoginPassword')}
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setResetOpen(false); setNewPassword(''); setLoginEmail(''); }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => { void handleResetPassword(); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60"
              >
                {resetBusy ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
                {t('resetPassword')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
