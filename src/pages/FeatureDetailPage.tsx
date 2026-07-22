import React, { useEffect } from 'react';
import { Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BlogNavbar from '../components/blog/BlogNavbar';
import BlogFooter from '../components/blog/BlogFooter';
import { navigateTo, updatePageMeta, setJsonLd } from '../utils/seo';
import { FEATURES } from '../data/features';
import { APP_NAME } from '../config/branding';

const FEATURE_SLUGS = FEATURES.map(f => f.slug);

interface FeatureDetailPageProps {
  slug: string;
  onBack: () => void;
  onRegisterClick?: () => void;
}

const FeatureDetailPage: React.FC<FeatureDetailPageProps> = ({ slug, onBack, onRegisterClick }) => {
  const { t, i18n } = useTranslation('marketing');
  const feature = FEATURES.find(f => f.slug === slug);

  const currentIndex = FEATURE_SLUGS.indexOf(slug);
  const prevFeature = currentIndex > 0 ? FEATURES[currentIndex - 1] : null;
  const nextFeature = currentIndex < FEATURES.length - 1 ? FEATURES[currentIndex + 1] : null;

  const title = feature
    ? t(`featuresPage.catalog.${feature.slug}.title`, { defaultValue: feature.title })
    : '';
  const heroDescription = feature
    ? t(`featuresPage.catalog.${feature.slug}.description`, { defaultValue: feature.heroDescription })
    : '';

  useEffect(() => {
    window.scrollTo(0, 0);
    if (feature) {
      const origin = window.location.origin;
      updatePageMeta(
        `${title} | ${APP_NAME}`,
        heroDescription,
        `${origin}/features/${feature.slug}`
      );
      setJsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SoftwareApplication',
            name: `${APP_NAME} — ${title}`,
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web, Android, iOS',
            description: heroDescription,
            url: `${origin}/features/${feature.slug}`,
            image: `${origin}/img/screenshot-wide.webp`,
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'BRL',
            },
            featureList: feature.sections.flatMap(s => s.bullets).join(', '),
            isPartOf: {
              '@type': 'SoftwareApplication',
              name: APP_NAME,
              url: origin,
            },
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: t('home'), item: origin + '/' },
              { '@type': 'ListItem', position: 2, name: t('features'), item: origin + '/features' },
              { '@type': 'ListItem', position: 3, name: title, item: `${origin}/features/${feature.slug}` },
            ],
          },
        ],
      });
    }
    return () => { setJsonLd(null); };
  }, [slug, feature, title, heroDescription, t, i18n.language]);

  if (!feature) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <BlogNavbar onBack={onBack} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('featureDetail.notFoundTitle')}</h2>
            <p className="text-slate-500 mb-6">{t('featureDetail.notFoundBody')}</p>
            <button
              onClick={() => navigateTo('/features')}
              className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all"
            >
              {t('viewAllFeatures')}
            </button>
          </div>
        </div>
        <BlogFooter />
      </div>
    );
  }

  const FeatureIcon = feature.icon;
  const prevTitle = prevFeature
    ? t(`featuresPage.catalog.${prevFeature.slug}.title`, { defaultValue: prevFeature.title })
    : '';
  const nextTitle = nextFeature
    ? t(`featuresPage.catalog.${nextFeature.slug}.title`, { defaultValue: nextFeature.title })
    : '';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <BlogNavbar onBack={onBack} />

      <div className="bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav className="flex items-center gap-2 text-sm text-slate-500">
            <button onClick={() => navigateTo('/')} className="hover:text-primary transition-colors font-medium">{t('home')}</button>
            <span>/</span>
            <button onClick={() => navigateTo('/features')} className="hover:text-primary transition-colors font-medium">{t('features')}</button>
            <span>/</span>
            <span className="text-slate-900 font-semibold">{title}</span>
          </nav>
        </div>
      </div>

      <div className={`${feature.bg} border-b ${feature.border}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="max-w-3xl">
            <div className={`w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-sm border ${feature.border}`}>
              <FeatureIcon size={32} className={feature.color} />
            </div>
            <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-6">
              {title}
            </h1>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed">
              {heroDescription}
            </p>
            <div className="mt-8">
              <button
                onClick={() => onRegisterClick ? onRegisterClick() : navigateTo('/')}
                className="px-8 py-3.5 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-colors shadow-sm text-sm"
              >
                {t('getStarted')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="space-y-20">
            {feature.sections.map((section, i) => (
              <section key={i}>
                <div className={`flex flex-col ${i % 2 === 1 ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-12 items-start`}>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">{section.heading}</h2>
                    <p className="text-slate-600 text-base leading-relaxed mb-8">{section.description}</p>
                    <ul className="space-y-3">
                      {section.bullets.map(bullet => (
                        <li key={bullet} className="flex items-start gap-3">
                          <Check size={18} className={`${feature.color} mt-0.5 flex-shrink-0`} />
                          <span className="text-sm text-slate-700">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex-1 min-w-0 w-full">
                    <div className={`${feature.bg} ${feature.border} border rounded-2xl p-8 md:p-12 flex flex-col items-center justify-center min-h-[280px]`}>
                      <FeatureIcon size={56} className={`${feature.color} opacity-15 mb-3`} />
                      <p className="text-sm font-medium text-slate-400">{section.heading}</p>
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="bg-white border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-semibold text-slate-900">{t('featureDetail.whoFor')}</h2>
              <p className="text-slate-500 mt-3">{t('featureDetail.useCasesFor', { feature: title.toLowerCase() })}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              {feature.useCases.map(uc => (
                <div key={uc.title} className="text-center">
                  <div className={`w-14 h-14 ${feature.bg} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                    <FeatureIcon size={24} className={feature.color} />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">{uc.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{uc.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {prevFeature ? (
              <button
                onClick={() => navigateTo(`/features/${prevFeature.slug}`)}
                className="flex items-center gap-3 p-5 bg-white border border-slate-200 rounded-xl hover:border-primary hover:shadow-sm transition-all text-left"
              >
                <ArrowLeft size={18} className="text-slate-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 font-medium">{t('featureDetail.previousFeature')}</p>
                  <p className="text-sm font-bold text-slate-900">{prevTitle}</p>
                </div>
              </button>
            ) : <div />}
            {nextFeature && (
              <button
                onClick={() => navigateTo(`/features/${nextFeature.slug}`)}
                className="flex items-center justify-end gap-3 p-5 bg-white border border-slate-200 rounded-xl hover:border-primary hover:shadow-sm transition-all text-right"
              >
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 font-medium">{t('featureDetail.nextFeature')}</p>
                  <p className="text-sm font-bold text-slate-900">{nextTitle}</p>
                </div>
                <ArrowRight size={18} className="text-slate-400 flex-shrink-0" />
              </button>
            )}
          </div>

          <div className="mt-8 pt-8 border-t border-slate-200">
            <button
              onClick={() => navigateTo('/features')}
              className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary transition-colors"
            >
              <ArrowLeft size={16} /> {t('featureDetail.viewAll')}
            </button>
          </div>
        </div>

        <div className="bg-primary/5 border-y border-primary/10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
            <h2 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-4">
              {t('featureDetail.readyToTry', { feature: title.toLowerCase() })}
            </h2>
            <p className="text-lg text-slate-500 mb-8">
              {t('featureDetail.readyBody')}
            </p>
            <button
              onClick={() => onRegisterClick ? onRegisterClick() : navigateTo('/')}
              className="px-8 py-3.5 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-colors shadow-sm text-sm"
            >
              {t('getStarted')}
            </button>
          </div>
        </div>
      </div>

      <BlogFooter />
    </div>
  );
};

export default FeatureDetailPage;
