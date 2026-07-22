import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Clock, CreditCard, Zap, LogIn, Download, Share, MoreVertical, X } from 'lucide-react';

interface HeroSectionProps {
  onLoginClick: () => void;
  onRegisterClick: () => void;
  onLoginSuccess?: (user: any) => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ onLoginClick, onRegisterClick }) => {
  const { t } = useTranslation('marketing');
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);
  }, []);

  return (
    <section className="relative pt-28 md:pt-36 pb-16 md:pb-24 overflow-hidden">
      <div className="absolute top-0 right-[-20%] w-[60%] h-[60%] bg-primary/5 blur-[120px] rounded-full -z-10"></div>
      <div className="absolute bottom-0 left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[100px] rounded-full -z-10"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-4xl mx-auto">
          <div className="sm:hidden mb-8 flex flex-col gap-3">
            <button
              onClick={onLoginClick}
              className="w-full py-3.5 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2"
            >
              <LogIn size={18} /> {t('loginToAccount')}
            </button>
            <button
              onClick={onRegisterClick}
              className="w-full py-3.5 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-primary-hover transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {t('getStarted')} <ArrowRight size={18} />
            </button>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/5 border border-primary/10 rounded-full mb-6">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-bold text-primary">{t('hero.badge')}</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-slate-900 tracking-tight leading-[1.1] mb-6">
            {t('hero.title')}{' '}
            <span className="text-primary">{t('hero.titleHighlight')}</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('hero.subtitle')}
          </p>

          <div className="hidden sm:flex items-center justify-center gap-4 mb-12">
            <button
              onClick={onLoginClick}
              className="px-8 py-4 bg-slate-900 text-white font-bold text-sm rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2"
            >
              <LogIn size={18} /> {t('loginToAccount')}
            </button>
            <button
              onClick={onRegisterClick}
              className="px-8 py-4 bg-primary text-white font-bold text-sm rounded-2xl hover:bg-primary-hover transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {t('getStarted')} <ArrowRight size={18} />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 mb-16">
            <div className="flex items-center gap-2 text-slate-400">
              <Clock size={16} className="text-emerald-500" />
              <span className="text-xs font-semibold">{t('hero.freeForever')}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <CreditCard size={16} className="text-emerald-500" />
              <span className="text-xs font-semibold">{t('hero.noCreditCard')}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Zap size={16} className="text-emerald-500" />
              <span className="text-xs font-semibold">{t('hero.setupMinutes')}</span>
            </div>
          </div>

          <div className="relative max-w-4xl mx-auto mb-16">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-6">{t('hero.videoTitle')}</h2>
            <div className="rounded-2xl overflow-hidden shadow-xl shadow-slate-900/10 border border-slate-200/60">
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute top-0 left-0 w-full h-full"
                  src="https://www.youtube.com/embed/Wb-4mt90IFU"
                  title={t('hero.videoIframeTitle')}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                ></iframe>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showInstallGuide && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-in slide-in-from-bottom-10 border border-slate-100">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Download size={16} className="text-primary" /> {t('hero.installGuide')}
              </h3>
              <button onClick={() => setShowInstallGuide(false)} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-900 transition-colors">
                <X size={16} />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 font-medium">{t('hero.installIosIntro')}</p>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-blue-500"><Share size={16} /></div>
                  <p className="text-xs font-bold text-slate-700">{t('hero.installIosStep1')}</p>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-slate-900 font-bold text-sm">+</div>
                  <p className="text-xs font-bold text-slate-700">{t('hero.installIosStep2')}</p>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-blue-600 font-bold text-[10px]">Add</div>
                  <p className="text-xs font-bold text-slate-700">{t('hero.installIosStep3')}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 font-medium">{t('hero.installAndroidIntro')}</p>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-slate-600"><MoreVertical size={16} /></div>
                  <p className="text-xs font-bold text-slate-700">{t('hero.installAndroidStep1')}</p>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-primary"><Download size={16} /></div>
                  <p className="text-xs font-bold text-slate-700">{t('hero.installAndroidStep2')}</p>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowInstallGuide(false)}
              className="w-full mt-5 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-hover transition-colors"
            >
              {t('hero.gotIt')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default HeroSection;
