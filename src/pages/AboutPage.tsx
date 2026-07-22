import React, { useEffect } from 'react';
import { Info, Heart, Globe, Code, Users, GitBranch, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BlogNavbar from '../components/blog/BlogNavbar';
import BlogFooter from '../components/blog/BlogFooter';
import { navigateTo, updatePageMeta, setJsonLd } from '../utils/seo';
import { APP_NAME } from '../config/branding';

interface AboutPageProps {
  onBack: () => void;
  onRegisterClick?: () => void;
}

const AboutPage: React.FC<AboutPageProps> = ({ onBack, onRegisterClick }) => {
  const { t, i18n } = useTranslation('marketing');

  useEffect(() => {
    window.scrollTo(0, 0);
    updatePageMeta(
      t('aboutPage.seoTitle'),
      t('aboutPage.seoDescription'),
      window.location.origin + '/about'
    );
    setJsonLd({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'AboutPage',
          name: t('aboutPage.title'),
          description: t('aboutPage.seoDescription'),
          url: window.location.origin + '/about',
          isPartOf: {
            '@type': 'WebSite',
            name: APP_NAME,
            url: window.location.origin,
          },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: t('home'), item: window.location.origin + '/' },
            { '@type': 'ListItem', position: 2, name: t('about'), item: window.location.origin + '/about' },
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

  const stats = [
    { icon: Users, value: '50+', label: t('aboutPage.stats.orgs') },
    { icon: Code, value: '100%', label: t('aboutPage.stats.openSource') },
    { icon: Globe, value: 'PWA', label: t('aboutPage.stats.pwa') },
  ];

  const values = [
    { icon: Heart, key: 'freeForever' },
    { icon: Globe, key: 'openSource' },
    { icon: Users, key: 'community' },
    { icon: GitBranch, key: 'scale' },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <BlogNavbar onBack={onBack} onRegisterClick={onRegisterClick} />

      <div className="bg-white border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
            <Info className="text-primary" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-6">
            {t('aboutPage.title')}
          </h1>
          <p className="text-lg md:text-xl text-slate-500 max-w-3xl mx-auto leading-relaxed">
            {t('aboutPage.intro')}
          </p>
        </div>
      </div>

      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
          <div className="space-y-20">
            <section>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-6">{t('aboutPage.storyTitle')}</h2>
              <div className="prose prose-slate prose-lg max-w-none">
                <p className="text-slate-600 leading-relaxed mb-4">{t('aboutPage.storyP1')}</p>
                <p className="text-slate-600 leading-relaxed mb-4"><em>{t('aboutPage.storyP2')}</em></p>
                <p className="text-slate-600 leading-relaxed mb-4">{t('aboutPage.storyP3')}</p>
                <p className="text-slate-600 leading-relaxed">{t('aboutPage.storyP4')}</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-6">{t('aboutPage.missionTitle')}</h2>
              <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6 sm:p-10">
                <p className="text-lg md:text-xl text-slate-700 leading-relaxed font-medium text-center">
                  {t('aboutPage.missionText')}
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8">{t('aboutPage.valuesTitle')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {values.map((value) => (
                  <div
                    key={value.key}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                      <value.icon size={22} className="text-primary" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{t(`aboutPage.values.${value.key}.title`)}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{t(`aboutPage.values.${value.key}.description`)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8 text-center">{t('aboutPage.statsTitle')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="text-center p-8 bg-white rounded-2xl border border-slate-100 shadow-sm"
                  >
                    <stat.icon size={28} className="text-primary mx-auto mb-4" />
                    <p className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</p>
                    <p className="text-sm text-slate-500">{stat.label}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-slate-900 rounded-3xl p-8 sm:p-12 text-center text-white">
              <Code size={40} className="mx-auto mb-4 text-primary" />
              <h2 className="text-2xl md:text-3xl font-bold mb-4">{t('aboutPage.openSourceTitle')}</h2>
              <p className="text-slate-300 text-base leading-relaxed max-w-2xl mx-auto mb-8">
                {t('aboutPage.openSourceBody')}
              </p>
              <a
                href="https://github.com/mimnets/openhrapp"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-100 transition-colors text-sm"
              >
                <GitBranch size={18} /> {t('aboutPage.viewGithub')}
              </a>
            </section>

            <section className="text-center bg-primary/5 border border-primary/10 rounded-3xl p-8 sm:p-12">
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
                {t('aboutPage.ctaTitle')}
              </h2>
              <p className="text-slate-500 text-lg max-w-2xl mx-auto mb-8">
                {t('aboutPage.ctaBody')}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={handleGetStarted}
                  className="px-8 py-3.5 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-colors shadow-sm text-sm flex items-center gap-2"
                >
                  {t('getStarted')} <ArrowRight size={16} />
                </button>
                <button
                  onClick={() => navigateTo('/features')}
                  className="px-8 py-3.5 bg-white text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors text-sm border border-slate-200"
                >
                  {t('aboutPage.exploreFeatures')}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      <BlogFooter />
    </div>
  );
};

export default AboutPage;
