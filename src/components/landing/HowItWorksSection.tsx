import React from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, UserPlus, Rocket } from 'lucide-react';

const STEP_META = [
  { key: '01', icon: Building2, step: '01', color: 'text-primary', bg: 'bg-primary/10' },
  { key: '02', icon: UserPlus, step: '02', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: '03', icon: Rocket, step: '03', color: 'text-amber-600', bg: 'bg-amber-50' },
] as const;

const HowItWorksSection: React.FC = () => {
  const { t } = useTranslation('marketing');

  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold text-primary uppercase tracking-wide">{t('howItWorks.eyebrow')}</span>
          <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 mt-3 mb-4">
            {t('howItWorks.title')}
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            {t('howItWorks.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {STEP_META.map((s, idx) => (
            <div key={s.key} className="relative text-center">
              {idx < STEP_META.length - 1 && (
                <div className="hidden md:block absolute top-10 left-[60%] w-[80%] h-px bg-slate-200"></div>
              )}

              <div className={`w-20 h-20 ${s.bg} rounded-2xl flex items-center justify-center mx-auto mb-5 relative`}>
                <s.icon size={28} className={s.color} aria-hidden="true" />
                <span className="absolute -top-2 -right-2 w-7 h-7 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center text-xs font-semibold text-slate-500">
                  {s.step}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                {t(`howItWorks.steps.${s.step}.title`)}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
                {t(`howItWorks.steps.${s.step}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
