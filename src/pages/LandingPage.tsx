import React, { useEffect, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/landing/Navbar';
import HeroSection from '../components/landing/HeroSection';
import FeaturesSection from '../components/landing/FeaturesSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import PricingSection from '../components/landing/PricingSection';
import TestimonialsSection from '../components/landing/TestimonialsSection';
import Footer from '../components/landing/Footer';
import { updatePageMeta, setJsonLd } from '../utils/seo';
import { APP_NAME } from '../config/branding';

const ShowcaseSection = React.lazy(() => import('../components/landing/ShowcaseSection'));
const FAQSection = React.lazy(() => import('../components/landing/FAQSection'));
const ContactSection = React.lazy(() => import('../components/landing/ContactSection'));
const CTASection = React.lazy(() => import('../components/landing/CTASection'));

const SectionSkeleton = () => (
  <div className="py-20 flex justify-center">
    <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
  </div>
);

interface LandingPageProps {
  onLoginClick: () => void;
  onRegisterClick: () => void;
  onLoginSuccess?: (user: any) => void;
}

type FaqGroup = {
  category: string;
  items: Array<{ q: string; a: string }>;
};

const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick, onRegisterClick, onLoginSuccess }) => {
  const { t, i18n } = useTranslation('marketing');

  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';

    updatePageMeta(
      t('seo.landingTitle'),
      t('seo.landingDescription'),
      window.location.origin + '/',
      window.location.origin + '/img/screenshot-wide.webp'
    );

    const groups = t('faq.groups', { returnObjects: true }) as FaqGroup[];
    const faqEntities = Array.isArray(groups)
      ? groups.flatMap((g) => g.items).slice(0, 4).map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        }))
      : [];

    setJsonLd({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'SoftwareApplication',
          name: APP_NAME,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web, Android, iOS',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'BRL',
          },
          description: t('seo.landingDescription'),
          url: window.location.origin,
          image: window.location.origin + '/img/screenshot-wide.webp',
        },
        {
          '@type': 'FAQPage',
          mainEntity: faqEntities,
        },
      ],
    });

    return () => {
      document.documentElement.style.scrollBehavior = '';
      setJsonLd(null);
    };
  }, [t, i18n.language]);

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-white focus:font-semibold focus:shadow-lg"
      >
        {t('skipToContent')}
      </a>
      <Navbar onLoginClick={onLoginClick} onRegisterClick={onRegisterClick} onLoginSuccess={onLoginSuccess} />
      <main id="main-content">
        <HeroSection onLoginClick={onLoginClick} onRegisterClick={onRegisterClick} onLoginSuccess={onLoginSuccess} />
        <TestimonialsSection />
        <FeaturesSection />
        <HowItWorksSection />
        <Suspense fallback={<SectionSkeleton />}><PricingSection onRegisterClick={onRegisterClick} /></Suspense>
        <Suspense fallback={<SectionSkeleton />}><ShowcaseSection /></Suspense>
        <Suspense fallback={<SectionSkeleton />}><FAQSection /></Suspense>
        <Suspense fallback={<SectionSkeleton />}><ContactSection /></Suspense>
        <Suspense fallback={<SectionSkeleton />}><CTASection onRegisterClick={onRegisterClick} /></Suspense>
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;
