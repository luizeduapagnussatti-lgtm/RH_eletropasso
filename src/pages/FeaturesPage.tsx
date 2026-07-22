import React, { useEffect } from 'react';
import { Shield, Smartphone, Globe, Bell, Settings, Check, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BlogNavbar from '../components/blog/BlogNavbar';
import BlogFooter from '../components/blog/BlogFooter';
import { navigateTo, updatePageMeta, setJsonLd } from '../utils/seo';
import { features } from '../data/features';
import { APP_NAME } from '../config/branding';

const platformMeta = [
  { icon: Smartphone, key: 'anyDevice' },
  { icon: Globe, key: 'cloud' },
  { icon: Bell, key: 'notifications' },
  { icon: Shield, key: 'secure' },
  { icon: Settings, key: 'customizable' },
] as const;

// openhr / typical pattern: true | false | 'paid'
const comparisonPattern: Array<{ openhr: true; typical: true | false | 'paid' }> = [
  { openhr: true, typical: true },
  { openhr: true, typical: false },
  { openhr: true, typical: true },
  { openhr: true, typical: 'paid' },
  { openhr: true, typical: true },
  { openhr: true, typical: 'paid' },
  { openhr: true, typical: true },
  { openhr: true, typical: true },
  { openhr: true, typical: 'paid' },
  { openhr: true, typical: false },
  { openhr: true, typical: false },
  { openhr: true, typical: false },
];

interface FeaturesPageProps {
  onBack: () => void;
  onRegisterClick?: () => void;
}

const FeaturesPage: React.FC<FeaturesPageProps> = ({ onBack, onRegisterClick }) => {
  const { t, i18n } = useTranslation('marketing');
  const comparisonRows = t('featuresPage.comparisonRows', { returnObjects: true }) as string[];
  const paidAddon = t('featuresPage.paidAddon');

  useEffect(() => {
    updatePageMeta(
      t('featuresPage.seoTitle'),
      t('featuresPage.seoDescription'),
      window.location.origin + '/features',
      window.location.origin + '/img/screenshot-wide.webp'
    );
    setJsonLd({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          name: t('featuresPage.title'),
          description: t('featuresPage.seoDescription'),
          url: window.location.origin + '/features',
          isPartOf: { '@type': 'WebSite', name: APP_NAME, url: window.location.origin },
        },
        {
          '@type': 'ItemList',
          name: t('featuresPage.title'),
          url: window.location.origin + '/features',
          numberOfItems: features.length,
          itemListElement: features.map((f, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: t(`featuresPage.catalog.${f.slug}.title`, { defaultValue: f.title }),
            url: `${window.location.origin}/features/${f.slug}`,
          })),
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: t('home'), item: window.location.origin + '/' },
            { '@type': 'ListItem', position: 2, name: t('features'), item: window.location.origin + '/features' },
          ],
        },
      ],
    });
    return () => { setJsonLd(null); };
  }, [t, i18n.language]);

  const handleGetStarted = () => {
    if (onRegisterClick) onRegisterClick();
    else navigateTo('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <BlogNavbar onBack={onBack} />

      <div className="bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 text-center">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">{t('featuresPage.eyebrow')}</span>
          <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mt-4 mb-6">
            {t('featuresPage.title')}
          </h1>
          <p className="text-lg md:text-xl text-slate-500 max-w-3xl mx-auto leading-relaxed">
            {t('featuresPage.subtitle')}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleGetStarted}
              className="px-8 py-3.5 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-colors shadow-sm text-sm"
            >
              {t('getStarted')}
            </button>
            <button
              onClick={() => navigateTo('/how-to-use')}
              className="px-8 py-3.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm border border-slate-200"
            >
              {t('featuresPage.viewGuides')}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="space-y-24">
            {features.map((feature, index) => {
              const title = t(`featuresPage.catalog.${feature.slug}.title`, { defaultValue: feature.title });
              const subtitle = t(`featuresPage.catalog.${feature.slug}.subtitle`, { defaultValue: feature.subtitle });
              const description = t(`featuresPage.catalog.${feature.slug}.description`, { defaultValue: feature.description });
              const subFeatures = t(`featuresPage.catalog.${feature.slug}.subFeatures`, {
                returnObjects: true,
                defaultValue: feature.subFeatures,
              }) as string[];

              return (
                <section key={feature.slug} id={feature.slug}>
                  <div className={`flex flex-col ${index % 2 === 1 ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-12 items-start`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-12 h-12 ${feature.bg} rounded-xl flex items-center justify-center`}>
                          <feature.icon size={22} className={feature.color} />
                        </div>
                        <div>
                          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">{title}</h2>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-primary mb-4">{subtitle}</p>
                      <p className="text-slate-600 text-base leading-relaxed mb-8">{description}</p>

                      <ul className="space-y-3">
                        {Array.isArray(subFeatures) && subFeatures.map(sub => (
                          <li key={sub} className="flex items-start gap-3">
                            <Check size={18} className={`${feature.color} mt-0.5 flex-shrink-0`} />
                            <span className="text-sm text-slate-700">{sub}</span>
                          </li>
                        ))}
                      </ul>

                      <button
                        onClick={() => navigateTo(`/features/${feature.slug}`)}
                        className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-hover transition-colors"
                      >
                        {t('featuresPage.learnMoreAbout', { feature: title.toLowerCase() })} <ArrowRight size={14} />
                      </button>
                    </div>

                    <div className="flex-1 min-w-0 w-full">
                      <div className={`${feature.bg} ${feature.border} border rounded-2xl p-8 md:p-12 flex flex-col items-center justify-center min-h-[320px]`}>
                        <feature.icon size={64} className={`${feature.color} opacity-20 mb-4`} />
                        <p className="text-sm font-semibold text-slate-400">{title}</p>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <div className="bg-white border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-xs font-bold text-primary uppercase tracking-widest">{t('featuresPage.platformEyebrow')}</span>
              <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mt-3 mb-4">
                {t('featuresPage.platformTitle')}
              </h2>
              <p className="text-slate-500 text-lg">
                {t('featuresPage.platformSubtitle')}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {platformMeta.map(pf => (
                <div
                  key={pf.key}
                  className="p-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-100 dark:hover:shadow-black/30 hover:border-slate-200 dark:hover:border-slate-600 transition-all duration-300"
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-5">
                    <pf.icon size={22} className="text-primary" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">{t(`featuresPage.platform.${pf.key}.title`)}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{t(`featuresPage.platform.${pf.key}.description`)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">{t('featuresPage.comparisonEyebrow')}</span>
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mt-3 mb-4">
              {t('featuresPage.comparisonTitle')}
            </h2>
            <p className="text-slate-500 text-lg">
              {t('featuresPage.comparisonSubtitle')}
            </p>
          </div>
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-100">
                <div className="px-6 py-4 text-sm font-bold text-slate-900">{t('featuresPage.comparisonFeatureCol')}</div>
                <div className="px-6 py-4 text-sm font-bold text-primary text-center">{t('featuresPage.comparisonUsCol')}</div>
                <div className="px-6 py-4 text-sm font-bold text-slate-500 text-center">{t('featuresPage.comparisonTypicalCol')}</div>
              </div>
              {Array.isArray(comparisonRows) && comparisonRows.map((label, i) => {
                const row = comparisonPattern[i] || { openhr: true as const, typical: false as const };
                return (
                  <div
                    key={label}
                    className={`grid grid-cols-3 ${i < comparisonRows.length - 1 ? 'border-b border-slate-50' : ''} hover:bg-slate-50/50 transition-colors`}
                  >
                    <div className="px-6 py-3.5 text-sm text-slate-700">{label}</div>
                    <div className="px-6 py-3.5 flex justify-center">
                      <Check size={18} className="text-emerald-500" />
                    </div>
                    <div className="px-6 py-3.5 flex justify-center">
                      {row.typical === true ? (
                        <Check size={18} className="text-slate-400" />
                      ) : row.typical === false ? (
                        <span className="text-sm text-slate-300">-</span>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">{paidAddon}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-primary/5 border-y border-primary/10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 text-center">
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">
              {t('featuresPage.ctaTitle')}
            </h2>
            <p className="text-lg text-slate-500 mb-8 max-w-2xl mx-auto">
              {t('featuresPage.ctaBody')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleGetStarted}
                className="px-8 py-3.5 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-colors shadow-sm text-sm flex items-center gap-2"
              >
                {t('getStarted')} <ArrowRight size={16} />
              </button>
              <button
                onClick={() => navigateTo('/blog')}
                className="px-8 py-3.5 bg-white text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors text-sm border border-slate-200"
              >
                {t('featuresPage.readBlog')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <BlogFooter />
    </div>
  );
};

export default FeaturesPage;
