import React from 'react';
import { useTranslation } from 'react-i18next';
import { XCircle, Mail } from 'lucide-react';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../config/branding';

interface SuspendedPageProps {
  organizationName?: string;
  onLogout: () => void;
}

export const SuspendedPage: React.FC<SuspendedPageProps> = ({
  organizationName,
  onLogout
}) => {
  const { t } = useTranslation(['subscription', 'common']);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-8 h-8 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-slate-800 mb-2">
          {t('suspendedTitle')}
        </h1>

        {organizationName && (
          <p className="text-slate-500 mb-4">{organizationName}</p>
        )}

        <p className="text-slate-600 mb-6">
          {t('suspendedIntro')}
        </p>

        <ul className="text-left text-slate-600 mb-6 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-red-500 mt-1">•</span>
            <span>{t('suspendedReasonPayment')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-500 mt-1">•</span>
            <span>{t('suspendedReasonTerms')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-500 mt-1">•</span>
            <span>{t('suspendedReasonAdmin')}</span>
          </li>
        </ul>

        <div className="border-t pt-6 mb-6">
          <p className="text-slate-600 mb-4">{t('suspendedContact')}</p>
          <div className="flex flex-col gap-2 text-sm">
            <a href={SUPPORT_MAILTO} className="flex items-center justify-center gap-2 text-primary hover:underline">
              <Mail className="w-4 h-4" />
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="w-full py-2 px-4 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
        >
          {t('logout')}
        </button>
      </div>
    </div>
  );
};
