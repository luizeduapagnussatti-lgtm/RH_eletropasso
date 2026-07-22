import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, ArrowLeft } from 'lucide-react';
import BlogNavbar from '../components/blog/BlogNavbar';
import BlogFooter from '../components/blog/BlogFooter';
import { updatePageMeta, setJsonLd } from '../utils/seo';
import { APP_NAME } from '../config/branding';

interface TermsOfServicePageProps {
  onBack: () => void;
}

const TermsOfServicePage: React.FC<TermsOfServicePageProps> = ({ onBack }) => {
  const { t, i18n } = useTranslation('marketing');
  const s = (key: string) => t(`termsPage.sections.${key}`);
  const items = (key: string) => {
    const v = t(`termsPage.sections.${key}`, { returnObjects: true });
    return Array.isArray(v) ? (v as string[]) : [];
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    updatePageMeta(
      t('termsPage.seoTitle'),
      t('termsPage.seoDescription'),
      window.location.origin + '/terms'
    );
    setJsonLd({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          name: t('termsPage.seoTitle'),
          description: t('termsPage.seoDescription'),
          url: window.location.origin + '/terms',
          lastReviewed: '2026-04-21',
          isPartOf: { '@type': 'WebSite', name: APP_NAME, url: window.location.origin },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: t('home'), item: window.location.origin + '/' },
            { '@type': 'ListItem', position: 2, name: t('terms'), item: window.location.origin + '/terms' },
          ],
        },
      ],
    });
    return () => { setJsonLd(null); };
  }, [t, i18n.language]);

  const handleBack = () => {
    window.history.pushState(null, '', '/');
    onBack();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <BlogNavbar onBack={handleBack} />

      <div className="bg-white border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
            <FileText className="text-primary" size={28} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900 mb-3">{t('terms')}</h1>
          <p className="text-slate-500 text-sm">{t('termsPage.lastUpdated')}</p>
        </div>
      </div>

      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10 space-y-8">
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s1Title')}</h2>
              <p className="text-slate-600 leading-relaxed">{s('s1Body')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s2Title')}</h2>
              <p className="text-slate-600 leading-relaxed">{s('s2Body')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s3Title')}</h2>
              <ul className="list-disc list-inside text-slate-600 space-y-2 ml-2">
                {items('s3Items').map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s4Title')}</h2>
              <p className="text-slate-600 leading-relaxed mb-3">{s('s4Intro')}</p>
              <ul className="list-disc list-inside text-slate-600 space-y-2 ml-2">
                {items('s4Items').map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s5Title')}</h2>
              <p className="text-slate-600 leading-relaxed">{s('s5Body')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s6Title')}</h2>
              <p className="text-slate-600 leading-relaxed">{s('s6Body')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s7Title')}</h2>
              <p className="text-slate-600 leading-relaxed">{s('s7Body')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s8Title')}</h2>
              <p className="text-slate-600 leading-relaxed">{s('s8Body')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s9Title')}</h2>
              <p className="text-slate-600 leading-relaxed">{s('s9Body')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s10Title')}</h2>
              <p className="text-slate-600 leading-relaxed">{s('s10Body')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s11Title')}</h2>
              <p className="text-slate-600 leading-relaxed">{s('s11Body')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s12Title')}</h2>
              <p className="text-slate-600 leading-relaxed">{s('s12Body')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s13Title')}</h2>
              <p className="text-slate-600 leading-relaxed">{s('s13Body')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">{s('s14Title')}</h2>
              <p className="text-slate-600 leading-relaxed">{s('s14Intro')}</p>
              <div className="mt-3 p-4 bg-slate-50 rounded-xl text-slate-600">
                <p><strong>{s('contactName')}</strong></p>
              </div>
            </section>
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <ArrowLeft size={16} /> {t('backToHome')}
            </button>
          </div>
        </div>
      </div>

      <BlogFooter />
    </div>
  );
};

export default TermsOfServicePage;
