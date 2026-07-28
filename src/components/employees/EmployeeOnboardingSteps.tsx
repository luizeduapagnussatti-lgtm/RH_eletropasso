import React from 'react';
import { useTranslation } from 'react-i18next';
import { Employee, Shift, Team } from '../../types';
import { formatCpfDisplay, formatPisDisplay, formatClockCredentialDisplay, resolveClockCredential } from '../../utils/employeeCredentials';
import { needsClockAdmission } from '../../utils/roles';
import { tRole } from '../../i18n/statusMaps';

export interface OnboardingFormState {
  name: string;
  email: string;
  employeeId: string;
  clockCredential: string;
  /** RH confirms fingerprint enrolled on PrintPoint. */
  clockBiometricRegistered: boolean;
  cpf: string;
  password: string;
  role: Employee['role'];
  department: string;
  designation: string;
  avatar: string;
  joiningDate: string;
  mobile: string;
  emergencyContact: string;
  employmentType: Employee['employmentType'];
  location: string;
  workType: Employee['workType'];
  lineManagerId: string;
  teamId: string;
  shiftId: string;
  status: Employee['status'];
}

export const emptyOnboardingForm = (defaultShiftId = ''): OnboardingFormState => ({
  name: '',
  email: '',
  employeeId: '',
  clockCredential: '',
  clockBiometricRegistered: false,
  cpf: '',
  password: '',
  role: 'EMPLOYEE',
  department: '',
  designation: '',
  avatar: '',
  joiningDate: new Date().toISOString().split('T')[0],
  mobile: '',
  emergencyContact: '',
  employmentType: 'PERMANENT',
  location: '',
  workType: 'OFFICE',
  lineManagerId: '',
  teamId: '',
  shiftId: defaultShiftId,
  status: 'ACTIVE',
});

interface Props {
  form: OnboardingFormState;
  teams: Team[];
  shifts: Shift[];
  depts: string[];
  desigs: string[];
  rolesForForm: Employee['role'][];
  mode: 'create' | 'edit';
  onChange: (patch: Partial<OnboardingFormState>) => void;
  onPickAvatar: (file: File) => void;
}

export const StepIdentity: React.FC<Props> = ({
  form,
  onChange,
  onPickAvatar,
  mode,
}) => {
  const { t } = useTranslation('employees');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className="md:col-span-2">
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('onboarding.fullName')}</span>
        <input
          required
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.name}
          onChange={e => onChange({ name: e.target.value })}
        />
      </label>
      <label>
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('onboarding.cpf')}</span>
        <input
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          placeholder="000.000.000-00"
          value={form.cpf}
          onChange={e => onChange({ cpf: e.target.value })}
        />
      </label>
      <label>
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('officialEmployeeId')}</span>
        <input
          required={needsClockAdmission(form.role)}
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
          placeholder={t('employeeIdPlaceholder')}
          value={form.employeeId}
          onChange={e => onChange({ employeeId: e.target.value.replace(/\D/g, '').slice(0, 12) })}
        />
        <p className="text-[10px] text-slate-400 mt-1">{t('employeeIdPisHint')}</p>
      </label>
      <label>
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('clockCredential')}</span>
        <input
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
          placeholder={t('clockCredentialPlaceholder')}
          value={form.clockCredential}
          onChange={e => onChange({ clockCredential: e.target.value.replace(/\D/g, '').slice(0, 12) })}
        />
        <p className="text-[10px] text-slate-400 mt-1">{t('clockCredentialHint')}</p>
      </label>
      {needsClockAdmission(form.role) && (
        <label className="md:col-span-2 flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 rounded border-slate-300 text-primary focus:ring-primary"
            checked={form.clockBiometricRegistered}
            onChange={e => onChange({ clockBiometricRegistered: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
              {t('clockBiometricRegistered')}
            </span>
            <span className="block text-[11px] text-slate-500 mt-0.5">
              {t('clockBiometricRegisteredHint')}
            </span>
          </span>
        </label>
      )}
      <label>
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('joiningDate')}</span>
        <input
          type="date"
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.joiningDate}
          onChange={e => onChange({ joiningDate: e.target.value })}
        />
      </label>
      <label>
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('onboarding.mobile')}</span>
        <input
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.mobile}
          onChange={e => onChange({ mobile: e.target.value })}
        />
      </label>
      <label className="md:col-span-2">
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('onboarding.emergencyContact')}</span>
        <input
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.emergencyContact}
          onChange={e => onChange({ emergencyContact: e.target.value })}
        />
      </label>
      <label className="md:col-span-2">
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('onboarding.photo')}</span>
        <input
          type="file"
          accept="image/*"
          className="mt-1 block w-full text-sm"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onPickAvatar(f);
          }}
        />
        {form.avatar ? (
          <img src={form.avatar} alt="" className="mt-2 w-16 h-16 rounded-xl object-cover" />
        ) : null}
      </label>
      {mode === 'edit' ? (
        <p className="md:col-span-2 text-xs text-slate-400">{t('onboarding.editIdentityHint')}</p>
      ) : null}
    </div>
  );
};

export const StepContract: React.FC<Props> = ({
  form,
  teams,
  shifts,
  depts,
  desigs,
  onChange,
}) => {
  const { t } = useTranslation('employees');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <label>
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('department')}</span>
        <select
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.department}
          onChange={e => onChange({ department: e.target.value })}
        >
          <option value="">{t('unassigned')}</option>
          {depts.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('designation')}</span>
        <select
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.designation}
          onChange={e => onChange({ designation: e.target.value })}
        >
          <option value="">{t('unassigned')}</option>
          {desigs.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('assignedTeam')}</span>
        <select
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.teamId}
          onChange={e => {
            const teamId = e.target.value;
            const team = teams.find(t => t.id === teamId);
            onChange({ teamId, lineManagerId: team?.leaderId || '' });
          }}
        >
          <option value="">{t('noTeamAssigned')}</option>
          {teams.map(team => (
            <option key={team.id} value={team.id}>{team.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('assignedShift')}</span>
        <select
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.shiftId}
          onChange={e => onChange({ shiftId: e.target.value })}
        >
          <option value="">{t('noShiftAssigned')}</option>
          {shifts.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('onboarding.employmentType')}</span>
        <select
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.employmentType}
          onChange={e => onChange({ employmentType: e.target.value as Employee['employmentType'] })}
        >
          <option value="PERMANENT">{t('onboarding.permanent')}</option>
          <option value="CONTRACT">{t('onboarding.contract')}</option>
          <option value="TEMPORARY">{t('onboarding.temporary')}</option>
        </select>
      </label>
      <label>
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('workType')}</span>
        <select
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.workType}
          onChange={e => onChange({ workType: e.target.value as Employee['workType'] })}
        >
          <option value="OFFICE">{t('onboarding.office')}</option>
          <option value="FIELD">{t('onboarding.field')}</option>
        </select>
      </label>
      <label className="md:col-span-2">
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('onboarding.location')}</span>
        <input
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.location}
          onChange={e => onChange({ location: e.target.value })}
        />
      </label>
    </div>
  );
};

export const StepAccess: React.FC<Props & { showPassword: boolean; onTogglePassword: () => void }> = ({
  form,
  rolesForForm,
  mode,
  onChange,
  showPassword,
  onTogglePassword,
}) => {
  const { t } = useTranslation('employees');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className="md:col-span-2">
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('workEmail')}</span>
        <input
          type="email"
          required
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.email}
          onChange={e => onChange({ email: e.target.value })}
          placeholder={t('onboarding.emailLoginPlaceholder')}
        />
        <p className="text-[10px] text-slate-400 mt-1">{t('onboarding.emailLoginHint')}</p>
      </label>
      <label className="md:col-span-2">
        <span className="text-xs font-semibold text-slate-500 uppercase">
          {mode === 'edit' ? t('resetPassword') : t('initialPassword')}
        </span>
        <div className="relative mt-1">
          <input
            type={showPassword ? 'text' : 'password'}
            required={mode === 'create'}
            minLength={8}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pr-12"
            value={form.password}
            onChange={e => onChange({ password: e.target.value })}
            placeholder={mode === 'edit' ? t('leaveBlankPassword') : t('setLoginPassword')}
          />
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" onClick={onTogglePassword}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </label>
      <label className="md:col-span-2">
        <span className="text-xs font-semibold text-slate-500 uppercase">{t('accessLevel')}</span>
        <select
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          value={form.role}
          onChange={e => onChange({ role: e.target.value as Employee['role'] })}
        >
          {rolesForForm.map(r => (
            <option key={r} value={r}>{tRole(r)}</option>
          ))}
        </select>
        <p className="text-[10px] text-slate-400 mt-1">{t(`roleHints.${form.role}` as any)}</p>
      </label>
    </div>
  );
};

export const StepReview: React.FC<{ form: OnboardingFormState; teams: Team[]; shifts: Shift[] }> = ({
  form,
  teams,
  shifts,
}) => {
  const { t } = useTranslation('employees');
  const team = teams.find(x => x.id === form.teamId);
  const shift = shifts.find(x => x.id === form.shiftId);
  const rows = [
    [t('onboarding.fullName'), form.name],
    [t('officialEmployeeId'), formatPisDisplay(form.employeeId) || t('notAvailable')],
    [
      t('clockCredential'),
      formatClockCredentialDisplay(
        resolveClockCredential(form.clockCredential, form.employeeId)
      ) || t('notAvailable'),
    ],
    ...(needsClockAdmission(form.role)
      ? [[
          t('clockBiometricRegistered'),
          form.clockBiometricRegistered ? t('clockBiometricOk') : t('clockBiometricPending'),
        ] as [string, string]]
      : []),
    [t('onboarding.cpf'), form.cpf ? formatCpfDisplay(form.cpf) : t('notAvailable')],
    [t('department'), form.department || t('unassigned')],
    [t('designation'), form.designation || t('unassigned')],
    [t('assignedTeam'), team?.name || t('noTeamAssigned')],
    [t('assignedShift'), shift?.name || t('noShiftAssigned')],
    [t('workEmail'), form.email],
    [t('accessLevel'), tRole(form.role)],
  ];
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 px-4 py-3 text-sm">
          <span className="text-slate-500">{label}</span>
          <span className="font-medium text-slate-800 dark:text-slate-100 text-right">{value}</span>
        </div>
      ))}
    </div>
  );
};
