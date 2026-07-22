
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { hrService } from '../services/hrService';

interface VerifyAccountProps {
  token: string;
  onFinished: () => void;
}

export const VerifyAccount: React.FC<VerifyAccountProps> = ({ token, onFinished }) => {
  const { t } = useTranslation('auth');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState(() => t('verifyWorking'));
  const hasVerified = useRef(false);

  useEffect(() => {
    const verify = async () => {
      if (hasVerified.current) return;
      hasVerified.current = true;

      try {
        const result = await hrService.confirmVerification(token);
        if (result.success) {
          setStatus('success');
          setMessage(t('accountVerified'));
        } else {
          setStatus('error');
          setMessage(result.message || t('tokenInvalidExpired'));
        }
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || t('unexpectedError'));
      }
    };

    if (token) {
      verify();
    } else {
      setStatus('error');
      setMessage(t('noTokenFound'));
    }
  }, [token, t]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[#f8fafc] relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-light blur-[100px] rounded-full -z-10"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[100px] rounded-full -z-10"></div>

      <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-100 p-10 animate-in zoom-in duration-300">
        <div className="flex flex-col items-center text-center gap-6">

          {status === 'loading' && (
            <>
              <div className="p-4 bg-indigo-50 rounded-full animate-pulse">
                <Loader2 size={48} className="text-primary animate-spin" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-slate-900 uppercase tracking-tight">{t('verifyingHeading')}</h2>
                <p className="text-sm font-medium text-slate-500">{message}</p>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="p-4 bg-emerald-50 rounded-full animate-in zoom-in duration-300">
                <CheckCircle2 size={48} className="text-emerald-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-slate-900 uppercase tracking-tight">{t('verifiedHeading')}</h2>
                <p className="text-sm font-medium text-slate-500">{message}</p>
              </div>
              <button
                onClick={onFinished}
                className="w-full py-4 mt-4 bg-primary text-white rounded-[1.5rem] font-semibold uppercase text-xs tracking-wide shadow-sm hover:bg-primary-hover active:scale-[0.97] transition-all flex items-center justify-center gap-2"
              >
                {t('continueToLogin')} <ArrowRight size={16} />
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="p-4 bg-rose-50 rounded-full animate-in shake">
                <XCircle size={48} className="text-rose-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-slate-900 uppercase tracking-tight">{t('verificationFailedHeading')}</h2>
                <p className="text-sm font-medium text-slate-500">{message}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl w-full border border-slate-100">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1">{t('troubleshooting')}</p>
                <ul className="text-xs text-slate-600 text-left list-disc pl-4 space-y-1">
                  <li>{t('tipTokenExpired')}</li>
                  <li>{t('tipLinkUsed')}</li>
                  <li>{t('tipAlreadyVerified')}</li>
                </ul>
              </div>
              <button
                onClick={onFinished}
                className="w-full py-4 mt-2 bg-slate-100 text-slate-600 rounded-[1.5rem] font-semibold uppercase text-xs tracking-wide hover:bg-slate-200 transition-all"
              >
                {t('returnToLogin')}
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
};
