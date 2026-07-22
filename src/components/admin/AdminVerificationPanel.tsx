import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, CheckCircle2, Info, BadgeCheck, Loader2 } from 'lucide-react';
import { verificationService } from '../../services/verification.service';
import { tRole } from '../../i18n/statusMaps';
import { getDateLocale } from '../../i18n/format';

interface UnverifiedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  created: string;
  updated: string;
}

type FeedbackTone = 'success' | 'error' | 'info';

export const AdminVerificationPanel: React.FC = () => {
  const { t } = useTranslation('settings');
  const [users, setUsers] = useState<UnverifiedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [featureAvailable, setFeatureAvailable] = useState(true);

  useEffect(() => {
    loadUnverifiedUsers();
    let interval = setInterval(loadUnverifiedUsers, 30000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadUnverifiedUsers();
        interval = setInterval(loadUnverifiedUsers, 30000);
      } else {
        clearInterval(interval);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const loadUnverifiedUsers = async () => {
    setLoading(true);
    const result = await verificationService.getUnverifiedUsers();

    if (result.success) {
      setUsers(result.users);
      setMessage('');
      setFeatureAvailable(true);
    } else {
      if (result.error?.includes('Unauthorized') || result.error?.includes('Forbidden') || result.error?.includes('404')) {
        setFeatureAvailable(false);
        setMessage('');
      } else {
        setMessageTone('error');
        setMessage(t('verificationError', { message: result.error }));
      }
      setUsers([]);
    }

    setLoading(false);
  };

  const handleVerifyUser = async (userId: string, email: string) => {
    setVerifyingId(userId);
    setMessageTone('info');
    setMessage(t('verifyingUser'));

    const result = await verificationService.manuallyVerifyUser(userId);

    if (result.success) {
      setMessageTone('success');
      setMessage(t('userVerified', { email }));
      await loadUnverifiedUsers();
    } else {
      setMessageTone('error');
      setMessage(t('verificationError', { message: result.message }));
    }

    setVerifyingId(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(getDateLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!featureAvailable && !loading) {
    return null;
  }

  const feedbackStyles: Record<FeedbackTone, string> = {
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    error: 'bg-rose-50 text-rose-800 border-rose-200',
    info: 'bg-slate-50 text-slate-700 border-slate-200',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 md:p-8 space-y-6">
      <div>
        <h4 className="text-base font-semibold text-slate-900 tracking-tight">
          {t('pendingVerificationTitle')}
        </h4>
        <p className="text-sm text-slate-500 mt-1 font-medium">
          {t('pendingVerificationSubtitle')}
        </p>
      </div>

      {message ? (
        <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${feedbackStyles[messageTone]}`}>
          {message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={loadUnverifiedUsers}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold uppercase tracking-widest hover:bg-primary-hover disabled:opacity-60 transition-all"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('refresh')}
        </button>
        <span className="text-sm font-medium text-slate-500">
          {loading ? t('loadingUnverified') : t('pendingCount', { count: users.length })}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm font-medium">
          <Loader2 size={18} className="animate-spin" />
          {t('loadingUnverified')}
        </div>
      ) : users.length === 0 ? (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 size={20} className="flex-shrink-0 mt-0.5 text-emerald-600" />
          <p className="text-sm font-semibold">{t('allVerified')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-left">
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{t('email')}</th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{t('name')}</th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{t('role')}</th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{t('registered')}</th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <code className="text-xs font-semibold text-slate-800 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                      {user.email}
                    </code>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{user.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-widest ${
                        user.role === 'ADMIN'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {tRole(user.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-medium" title={user.created}>
                    {formatDate(user.created)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleVerifyUser(user.id, user.email)}
                      disabled={verifyingId === user.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold uppercase tracking-wider hover:bg-emerald-700 disabled:opacity-60 transition-all"
                    >
                      {verifyingId === user.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <BadgeCheck size={14} />
                      )}
                      {t('verify')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 md:p-5 space-y-3">
        <div className="flex items-center gap-2 text-slate-800">
          <Info size={18} className="text-primary flex-shrink-0" />
          <h5 className="text-sm font-semibold">{t('aboutManualVerification')}</h5>
        </div>
        <ul className="space-y-2 text-sm text-slate-600 font-medium leading-relaxed list-disc pl-5">
          <li>{t('manualVerificationTips.notReceived')}</li>
          <li>{t('manualVerificationTips.emailSent')}</li>
          <li>{t('manualVerificationTips.canLogin')}</li>
          <li>{t('manualVerificationTips.preferEmail')}</li>
          <li>{t('manualVerificationTips.checkMailSettings')}</li>
        </ul>
      </div>
    </div>
  );
};
