import React from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Calendar, Users, BarChart3, ClipboardCheck, ArrowRight } from 'lucide-react';
import { navigateTo } from '../../utils/seo';

const FEATURE_META = [
  { slug: 'attendance-tracking', icon: MapPin, color: 'text-blue-600', bg: 'bg-blue-50' },
  { slug: 'leave-management', icon: Calendar, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { slug: 'employee-directory', icon: Users, color: 'text-violet-600', bg: 'bg-violet-50' },
  { slug: 'reports-analytics', icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-50' },
  { slug: 'performance-reviews', icon: ClipboardCheck, color: 'text-rose-600', bg: 'bg-rose-50' },
] as const;

const FeaturesSection: React.FC = () => {
  const { t } = useTranslation('marketing');

  return (
    <section id="features" className="py-20 md:py-28 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold text-primary uppercase tracking-wide">{t('featuresSection.eyebrow')}</span>
          <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white mt-3 mb-4">
            {t('featuresSection.title')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg">
            {t('featuresSection.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURE_META.map((feature) => (
            <a
              key={feature.slug}
              href={`/features/${feature.slug}`}
              onClick={(e) => { e.preventDefault(); navigateTo(`/features/${feature.slug}`); }}
              className="group p-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-100 dark:hover:shadow-black/30 hover:border-slate-200 dark:hover:border-slate-600 transition-all duration-300 text-left cursor-pointer block"
            >
              <div className={`w-12 h-12 ${feature.bg} rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                <feature.icon size={22} className={feature.color} aria-hidden="true" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                {t(`featuresSection.items.${feature.slug}.title`)}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                {t(`featuresSection.items.${feature.slug}.description`)}
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                {t('learnMore')} <ArrowRight size={14} />
              </span>
            </a>
          ))}
        </div>

        <div className="text-center mt-10">
          <button
            onClick={() => navigateTo('/features')}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-primary border border-primary/20 rounded-xl hover:bg-primary/5 transition-colors"
          >
            {t('viewAllFeatures')} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
