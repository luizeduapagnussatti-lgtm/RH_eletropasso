import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, X, Home, BookOpen, FileText, Sun, Moon, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useSearch } from '../../context/SearchContext';
import { navigateTo } from '../../utils/seo';
import { APP_NAME } from '../../config/branding';

interface TutorialsNavbarProps {
  onBack: () => void;
  onRegisterClick?: () => void;
}

const TutorialsNavbar: React.FC<TutorialsNavbarProps> = ({ onRegisterClick }) => {
  const { t } = useTranslation('marketing');
  const { darkMode, setDarkModePreference } = useTheme();
  const { setSearchOpen } = useSearch();
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleDarkMode = () => {
    setDarkModePreference(darkMode ? 'light' : 'dark');
  };

  const goToTutorials = () => {
    navigateTo('/how-to-use');
    setMobileOpen(false);
  };

  const goToBlog = () => {
    navigateTo('/blog');
    setMobileOpen(false);
  };

  const goHome = () => {
    setMobileOpen(false);
    navigateTo('/');
  };

  const handleGetStarted = () => {
    setMobileOpen(false);
    if (onRegisterClick) {
      onRegisterClick();
    } else {
      navigateTo('/');
    }
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            <div className="flex items-center gap-2 cursor-pointer" onClick={goHome}>
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-1.5 border border-primary/20 shadow-sm overflow-hidden">
                <img src="/img/logo.webp" className="w-full h-full object-contain" alt={APP_NAME} />
              </div>
              <span className="text-lg font-semibold tracking-tight text-slate-900">{APP_NAME}</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <button onClick={goHome} className="text-sm font-semibold text-slate-600 hover:text-primary transition-colors">
                {t('home')}
              </button>
              <button onClick={goToBlog} className="text-sm font-semibold text-slate-600 hover:text-primary transition-colors">
                {t('blog')}
              </button>
              <button onClick={goToTutorials} className="text-sm font-semibold text-primary transition-colors">
                {t('guides')}
              </button>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <button onClick={() => setSearchOpen(true)} className="p-2.5 rounded-xl text-slate-500 hover:text-primary hover:bg-slate-100 transition-all" title={t('searchAria')}>
                <Search size={20} />
              </button>
              <button onClick={toggleDarkMode} className="p-2.5 rounded-xl text-slate-500 hover:text-primary hover:bg-slate-100 transition-all" title={darkMode ? t('lightMode') : t('darkMode')}>
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button onClick={goHome} className="px-5 py-2.5 text-sm font-bold text-slate-700 hover:text-primary transition-colors">
                {t('login')}
              </button>
              <button onClick={handleGetStarted} className="px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-hover transition-colors shadow-sm">
                {t('getStarted')}
              </button>
            </div>

            <div className="md:hidden flex items-center gap-1">
              <button onClick={() => setSearchOpen(true)} className="p-2 text-slate-500 hover:text-primary transition-colors" title={t('search')}>
                <Search size={20} />
              </button>
              <button onClick={toggleDarkMode} className="p-2 text-slate-500 hover:text-primary transition-colors" title={darkMode ? t('lightMode') : t('darkMode')}>
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 text-slate-600 hover:text-primary transition-colors">
                {mobileOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 shadow-lg">
            <div className="px-4 py-4 space-y-1">
              <button onClick={goHome} className="flex items-center gap-2 w-full text-left px-4 py-3 text-sm font-semibold text-slate-600 hover:text-primary hover:bg-slate-50 rounded-xl transition-colors">
                <Home size={16} /> {t('home')}
              </button>
              <button onClick={goToBlog} className="flex items-center gap-2 w-full text-left px-4 py-3 text-sm font-semibold text-slate-600 hover:text-primary hover:bg-slate-50 rounded-xl transition-colors">
                <FileText size={16} /> {t('blog')}
              </button>
              <button onClick={goToTutorials} className="flex items-center gap-2 w-full text-left px-4 py-3 text-sm font-semibold text-primary bg-primary/5 rounded-xl transition-colors">
                <BookOpen size={16} /> {t('guides')}
              </button>
              <div className="pt-3 mt-3 border-t border-slate-100 space-y-2">
                <button onClick={goHome} className="block w-full px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl text-center">
                  {t('login')}
                </button>
                <button onClick={handleGetStarted} className="block w-full px-4 py-3 bg-primary text-white text-sm font-bold rounded-xl text-center hover:bg-primary-hover transition-colors">
                  {t('getStarted')}
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>
      <div className="h-16 md:h-20" />
    </>
  );
};

export default TutorialsNavbar;
