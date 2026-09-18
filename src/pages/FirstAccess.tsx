import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, CheckCircle2, IdCard, Loader2, Lock, Mail, UserRound } from 'lucide-react';
import { authService } from '../services/auth.service';
import { STORE_LOGO_PATH } from '../config/branding';
import { formatCpfDisplay, normalizeCpf, validateCpf } from '../utils/employeeCredentials';

interface Props {
  onLoginSuccess: (user: any) => void;
  onBack: () => void;
}

type Step = 'cpf' | 'confirm' | 'credentials' | 'done';

export const FirstAccess: React.FC<Props> = ({ onLoginSuccess, onBack }) => {
  const { t } = useTranslation('auth');
  const [step, setStep] = useState<Step>('cpf');
  const [cpf, setCpf] = useState('');
  const [firstName, setFirstName] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mapError = (code?: string, fallback?: string) => {
    const key = code ? `firstAccess.errors.${code}` : '';
    if (key && t(key) !== key) return t(key);
    return fallback || t('firstAccess.errors.GENERIC');
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const digits = normalizeCpf(cpf);
    if (!validateCpf(digits).ok) {
      setError(t('firstAccess.errors.CPF_INVALID'));
      return;
    }
    setBusy(true);
    try {
      const res = await authService.lookupFirstAccess(digits);
      if (!res.ok || !res.firstName) {
        setError(mapError(res.code, res.error));
        return;
      }
      setFirstName(res.firstName);
      setConfirmName('');
      setStep('confirm');
    } catch (err: any) {
      setError(err?.message || t('firstAccess.errors.GENERIC'));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!confirmName.trim()) {
      setError(t('firstAccess.errors.NAME_MISMATCH'));
      return;
    }
    setStep('credentials');
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError(t('passwordMinLength'));
      return;
    }
    if (password !== password2) {
      setError(t('passwordsDoNotMatch'));
      return;
    }
    setBusy(true);
    try {
      const claim = await authService.claimEmployeeAccess({
        cpf: normalizeCpf(cpf),
        confirmFirstName: confirmName.trim(),
        email: email.trim(),
        password,
      });
      if (!claim.ok) {
        setError(mapError(claim.code, claim.error));
        return;
      }
      const login = await authService.login(claim.email || email.trim(), password);
      if (!login.user) {
        setError(login.error || t('loginFailed'));
        setStep('done');
        return;
      }
      onLoginSuccess(login.user);
    } catch (err: any) {
      setError(err?.message || t('firstAccess.errors.GENERIC'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#181818] px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border border-[#383838] bg-[#1f1f1f] shadow-2xl overflow-hidden">
        <div className="p-7 sm:p-9 space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="w-full max-w-[220px] rounded-2xl bg-black px-5 py-4 border border-white/10">
              <img src={STORE_LOGO_PATH} alt="Eletropasso" className="w-full h-auto object-contain" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold text-white">{t('firstAccess.title')}</h1>
              <p className="text-sm text-slate-400 mt-1">{t('firstAccess.subtitle')}</p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          )}

          {step === 'cpf' && (
            <form onSubmit={handleLookup} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase text-slate-400">{t('firstAccess.cpfLabel')}</span>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#3a495e] bg-[#181818] text-white"
                    value={cpf}
                    onChange={e => setCpf(formatCpfDisplay(e.target.value))}
                    placeholder="000.000.000-00"
                  />
                </div>
              </label>
              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-12 py-3.5 bg-[var(--brand-red)] text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy ? <Loader2 className="animate-spin" size={18} /> : <>{t('continue')} <ArrowRight size={16} /></>}
              </button>
            </form>
          )}

          {step === 'confirm' && (
            <form onSubmit={handleConfirm} className="space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                {t('firstAccess.confirmPrompt', { name: firstName })}
              </p>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase text-slate-400">{t('firstAccess.confirmNameLabel')}</span>
                <div className="relative">
                  <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    autoComplete="given-name"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#3a495e] bg-[#181818] text-white"
                    value={confirmName}
                    onChange={e => setConfirmName(e.target.value)}
                    placeholder={firstName}
                  />
                </div>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setStep('cpf'); setError(''); }}
                  className="flex-1 min-h-12 rounded-xl border border-[#3a495e] text-slate-200 text-sm font-medium"
                >
                  {t('firstAccess.back')}
                </button>
                <button
                  type="submit"
                  className="flex-[2] min-h-12 py-3.5 bg-[var(--brand-red)] text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                >
                  {t('firstAccess.yesItsMe')} <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}

          {step === 'credentials' && (
            <form onSubmit={handleClaim} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase text-slate-400">{t('firstAccess.emailLabel')}</span>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#3a495e] bg-[#181818] text-white"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                  />
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase text-slate-400">{t('firstAccess.passwordLabel')}</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#3a495e] bg-[#181818] text-white"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={t('passwordMinPlaceholder')}
                  />
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase text-slate-400">{t('confirmPassword')}</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#3a495e] bg-[#181818] text-white"
                    value={password2}
                    onChange={e => setPassword2(e.target.value)}
                    placeholder={t('repeatPasswordPlaceholder')}
                  />
                </div>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setStep('confirm'); setError(''); }}
                  className="flex-1 min-h-12 rounded-xl border border-[#3a495e] text-slate-200 text-sm font-medium"
                >
                  {t('firstAccess.back')}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-[2] min-h-12 py-3.5 bg-[var(--brand-red)] text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="animate-spin" size={18} /> : <>{t('firstAccess.submit')} <ArrowRight size={16} /></>}
                </button>
              </div>
            </form>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 text-center py-2">
              <CheckCircle2 size={36} className="text-emerald-400" />
              <p className="text-sm text-slate-300">{t('firstAccess.claimOkLoginManual')}</p>
              <button
                type="button"
                onClick={onBack}
                className="w-full min-h-12 py-3.5 bg-[var(--brand-red)] text-white rounded-xl font-semibold text-sm"
              >
                {t('backToLogin')}
              </button>
            </div>
          )}

          {step !== 'done' && (
            <button
              type="button"
              onClick={onBack}
              className="w-full min-h-11 py-2 text-slate-400 text-sm font-medium hover:text-white transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft size={14} /> {t('backToLogin')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FirstAccess;
