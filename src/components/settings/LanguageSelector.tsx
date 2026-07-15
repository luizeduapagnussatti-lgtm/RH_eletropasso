import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { setAppLanguage } from '../../i18n';

export const LanguageSelector: React.FC = () => {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const current = i18n.language?.startsWith('pt') ? 'pt-BR' : 'en';

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 md:p-8 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
          <Languages size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('language')}</h2>
          <p className="text-xs text-slate-400 font-medium">{t('languageHint')}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setAppLanguage('pt-BR')}
          className={`px-4 py-3 rounded-2xl border text-sm font-bold transition-all ${
            current === 'pt-BR'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
          }`}
        >
          {t('common:language.ptBR')}
        </button>
        <button
          type="button"
          onClick={() => setAppLanguage('en')}
          className={`px-4 py-3 rounded-2xl border text-sm font-bold transition-all ${
            current === 'en'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
          }`}
        >
          {t('common:language.en')}
        </button>
      </div>
    </div>
  );
};
