import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Loader2, Save } from 'lucide-react';
import { Employee, Shift, Team, User } from '../../types';
import { hrService } from '../../services/hrService';
import { organizationService } from '../../services/organization.service';
import { assignableRoles, needsClockAdmission } from '../../utils/roles';
import { normalizePis, validatePis, validateCpf } from '../../utils/employeeCredentials';
import {
  emptyOnboardingForm,
  OnboardingFormState,
  StepAccess,
  StepContract,
  StepIdentity,
  StepReview,
} from './EmployeeOnboardingSteps';

const STEPS = ['identity', 'contract', 'access', 'review'] as const;
type StepId = (typeof STEPS)[number];

interface Props {
  user: User;
  mode: 'create' | 'edit';
  employeeId?: string;
  onDone: (employee?: Employee) => void;
  onCancel: () => void;
}

export const EmployeeOnboardingWizard: React.FC<Props> = ({
  user,
  mode,
  employeeId,
  onDone,
  onCancel,
}) => {
  const { t } = useTranslation('employees');
  const rolesForForm = assignableRoles(user.role);

  const [step, setStep] = useState<StepId>('identity');
  const [form, setForm] = useState<OnboardingFormState>(emptyOnboardingForm());
  const [teams, setTeams] = useState<Team[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  const [desigs, setDesigs] = useState<string[]>([]);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const isLast = step === 'review';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [teamsList, shiftList, deptList, desigList] = await Promise.all([
        organizationService.getTeams().catch(() => []),
        hrService.getShifts().catch(() => []),
        organizationService.getDepartments().catch(() => []),
        organizationService.getDesignations().catch(() => []),
      ]);
      if (cancelled) return;
      setTeams(teamsList || []);
      setShifts(shiftList || []);
      setDepts(deptList || []);
      setDesigs(desigList || []);
      const defaultShift = (shiftList || []).find(s => s.isDefault);
      if (mode === 'create') {
        setForm(f => ({ ...f, shiftId: defaultShift?.id || f.shiftId }));
      }
    })();
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'edit' || !employeeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await hrService.getEmployees();
        const emp = list.find(e => e.id === employeeId);
        if (!emp || cancelled) return;
        setForm({
          name: emp.name,
          email: emp.email,
          employeeId: emp.employeeId,
          cpf: emp.cpf || '',
          password: '',
          role: emp.role,
          department: emp.department,
          designation: emp.designation,
          avatar: emp.avatar || '',
          joiningDate: emp.joiningDate || new Date().toISOString().split('T')[0],
          mobile: emp.mobile || '',
          emergencyContact: emp.emergencyContact || '',
          employmentType: emp.employmentType,
          location: emp.location || '',
          workType: emp.workType,
          lineManagerId: emp.lineManagerId || '',
          teamId: emp.teamId || '',
          shiftId: emp.shiftId || '',
          status: emp.status,
        });
        setSavedEmployee(emp);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, employeeId]);

  const patchForm = useCallback((patch: Partial<OnboardingFormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  }, []);

  const handleAvatar = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => patchForm({ avatar: reader.result as string });
    reader.readAsDataURL(file);
  };

  const validateStep = (): string | null => {
    if (step === 'identity') {
      if (!form.name.trim()) return t('onboarding.errors.nameRequired');
      if (needsClockAdmission(form.role)) {
        const pis = validatePis(form.employeeId);
        if (!pis.ok) return t('onboarding.errors.pisInvalid');
      }
      if (form.cpf) {
        const cpf = validateCpf(form.cpf);
        if (!cpf.ok) return t('onboarding.errors.cpfInvalid');
      }
    }
    if (step === 'access') {
      if (!form.email.trim()) return t('onboarding.errors.emailRequired');
      if (mode === 'create' && form.password.length < 8) return t('onboarding.errors.passwordShort');
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const goBack = () => {
    setError(null);
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const handleSubmit = async () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<Employee> & { password?: string } = {
        ...form,
        employeeId: normalizePis(form.employeeId) || form.employeeId,
        cpf: form.cpf,
      };
      if (mode === 'create') {
        await hrService.addEmployee(payload);
        const list = await hrService.getEmployees();
        const created = list.find(
          e => e.email === form.email || e.employeeId === normalizePis(form.employeeId)
        );
        // Parent navigates to employee-admission for clock roles (full-page cycle).
        onDone(created);
        return;
      } else if (employeeId) {
        if (!form.password) delete payload.password;
        await hrService.updateProfile(employeeId, payload);
        const list = await hrService.getEmployees();
        const updated = list.find(e => e.id === employeeId) || null;
        onDone(updated || undefined);
        return;
      }
    } catch (e: any) {
      setError(e?.message || t('operationFailed'));
    } finally {
      setSaving(false);
    }
  };

  const stepProps = useMemo(
    () => ({
      form,
      teams,
      shifts,
      depts,
      desigs,
      rolesForForm,
      mode,
      onChange: patchForm,
      onPickAvatar: handleAvatar,
    }),
    [form, teams, shifts, depts, desigs, rolesForForm, mode, patchForm]
  );

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <nav className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => i <= stepIndex && setStep(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              s === step
                ? 'bg-primary text-white border-primary'
                : i < stepIndex
                  ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 text-slate-400'
            }`}
          >
            {t(`onboarding.steps.${s}`)}
          </button>
        ))}
      </nav>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
        {step === 'identity' && <StepIdentity {...stepProps} />}
        {step === 'contract' && <StepContract {...stepProps} />}
        {step === 'access' && (
          <StepAccess
            {...stepProps}
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword(s => !s)}
          />
        )}
        {step === 'review' && (
          <>
            <StepReview form={form} teams={teams} shifts={shifts} />
            {needsClockAdmission(form.role) && mode === 'create' && (
              <p className="mt-4 text-sm text-slate-500">{t('onboarding.clockAfterSave')}</p>
            )}
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      <div className="flex justify-between gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border border-slate-200 text-sm"
          onClick={stepIndex === 0 ? onCancel : goBack}
        >
          <ChevronLeft size={16} />
          {stepIndex === 0 ? t('cancel') : t('onboarding.back')}
        </button>
        {isLast ? (
          <button
            type="button"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60"
            onClick={() => void handleSubmit()}
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            {mode === 'create' ? t('provisionUser') : t('updateProfile')}
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold"
            onClick={goNext}
          >
            {t('onboarding.next')}
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
