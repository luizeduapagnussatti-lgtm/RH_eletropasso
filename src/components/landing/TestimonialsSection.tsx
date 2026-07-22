import React from 'react';
import { useTranslation } from 'react-i18next';
import { Quote, Building2, Users, Activity } from 'lucide-react';

type TestimonialItem = {
  quote: string;
  name: string;
  role: string;
  initials: string;
};

const TestimonialsSection: React.FC = () => {
  const { t } = useTranslation('marketing');
  const items = t('testimonials.items', { returnObjects: true }) as TestimonialItem[];
  const stats = [
    { icon: Building2, value: '50+', label: t('testimonials.stats.orgs') },
    { icon: Users, value: '1,000+', label: t('testimonials.stats.employees') },
    { icon: Activity, value: '99.9%', label: t('testimonials.stats.uptime') },
  ];

  return (
    <section className="py-20 md:py-28 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold text-primary uppercase tracking-wide">{t('testimonials.eyebrow')}</span>
          <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white mt-3 mb-4">
            {t('testimonials.title')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg">
            {t('testimonials.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
          {Array.isArray(items) && items.map((item) => (
            <div key={item.name} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl p-6 md:p-8 relative">
              <Quote size={28} className="text-primary/20 absolute top-5 left-5" aria-hidden="true" />
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-4 h-4 text-amber-400 fill-amber-400" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-5 relative z-10">
                &ldquo;{item.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-primary font-bold text-sm">{item.initials}</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <stat.icon size={20} className="text-primary mx-auto mb-3" aria-hidden="true" />
              <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
              <p className="text-xs font-semibold text-slate-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
