import React from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Coffee, Shield, Zap, Users, Calendar, MapPin, BarChart3, ClipboardCheck, Globe } from 'lucide-react';

interface PricingSectionProps {
  onRegisterClick: () => void;
}

const FEATURE_ICONS = [MapPin, Calendar, Users, BarChart3, ClipboardCheck, Globe, Shield, Zap];

const PricingSection: React.FC<PricingSectionProps> = ({ onRegisterClick }) => {
  const { t } = useTranslation('marketing');
  const featureLabels = t('pricing.featureLabels', { returnObjects: true }) as string[];

  return (
    <section id="pricing" className="py-20 md:py-28 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold text-primary uppercase tracking-wide">{t('pricing.eyebrow')}</span>
          <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white mt-3 mb-4">
            {t('pricing.title')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg">
            {t('pricing.subtitle')}
          </p>
        </div>

        <div className="max-w-2xl mx-auto mb-12">
          <div className="bg-primary rounded-3xl p-8 md:p-12 text-center text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" aria-hidden="true" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" aria-hidden="true" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 rounded-full mb-6">
                <Heart size={14} className="text-rose-300" />
                <span className="text-xs font-bold text-white/90">{t('pricing.communityBadge')}</span>
              </div>

              <div className="mb-6">
                <span className="text-5xl md:text-6xl font-bold">$0</span>
                <span className="text-xl text-white/70 font-medium">{t('pricing.priceForever')}</span>
              </div>

              <p className="text-white/80 text-lg mb-8 max-w-md mx-auto">
                {t('pricing.priceBlurb')}
              </p>

              <button
                onClick={onRegisterClick}
                className="px-8 py-4 bg-white text-primary font-bold text-sm rounded-2xl hover:bg-slate-50 transition-colors shadow-lg inline-flex items-center gap-2"
              >
                {t('getStarted')} <Zap size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mb-12">
          {Array.isArray(featureLabels) && featureLabels.map((label, i) => {
            const Icon = FEATURE_ICONS[i] || Zap;
            return (
              <div key={label} className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-xl p-4">
                <Icon size={18} className="text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
              </div>
            );
          })}
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl p-8 md:p-10 text-center">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Coffee size={22} className="text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {t('pricing.supportTitle')}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto mb-4">
              {t('pricing.supportBody')}
            </p>
            <a
              href="#contact"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold text-sm hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              <Heart size={14} /> {t('pricing.sponsorGithub')}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
