import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, X, Sun, Moon, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useSearch } from '../../context/SearchContext';
import { navigateTo } from '../../utils/seo';
import { APP_NAME } from '../../config/branding';

interface NavbarProps {
  onLoginClick: () => void;
  onRegisterClick: () => void;
  onLoginSuccess?: (user: any) => void;
}

const Navbar: React.FC<NavbarProps> = ({ onLoginClick, onRegisterClick }) => {
  const { t } = useTranslation('marketing');
  const { darkMode, setDarkModePreference } = useTheme();
  const { setSearchOpen } = useSearch();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleDarkMode = () => {
    setDarkModePreference(darkMode ? 'light' : 'dark');
  };

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  };

  const navLinks = [
    { label: t('nav.features'), href: '/features', type: 'page' as const },
    { label: t('nav.howItWorks'), href: '#how-it-works', type: 'hash' as const },
    { label: t('nav.faq'), href: '#faq', type: 'hash' as const },
    { label: t('nav.contact'), href: '#contact', type: 'hash' as const },
    { label: t('nav.blog'), href: '/blog', type: 'page' as const },
    { label: t('nav.guides'), href: '/how-to-use', type: 'page' as const },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-white/95 backdrop-blur-md shadow-sm' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-1.5 border border-primary/20 shadow-sm overflow-hidden">
              <img src="/img/logo.webp" className="w-full h-full object-contain" alt={APP_NAME} width="48" height="48" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-slate-900">{APP_NAME}</span>
          </div>

          <div className="hidden md:flex items-center gap-5 lg:gap-7">
            {navLinks.map(link => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  if (link.type === 'page') {
                    e.preventDefault();
                    navigateTo(link.href);
                  } else {
                    e.preventDefault();
                    scrollTo(link.href.slice(1));
                  }
                }}
                className="text-sm font-semibold text-slate-600 hover:text-primary transition-colors"
              >
                {link.label}
              </a>
            ))}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
              aria-label={t('searchAria')}
            >
              <Search size={14} />
              <span>{t('search')}</span>
              <kbd className="text-[10px] font-medium text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">Ctrl+K</kbd>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              className="p-2.5 rounded-xl text-slate-500 hover:text-primary hover:bg-slate-100 transition-all"
              aria-label={darkMode ? t('lightMode') : t('darkMode')}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              onClick={onLoginClick}
              className="px-5 py-2.5 text-sm font-bold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200"
            >
              {t('login')}
            </button>
            <button
              onClick={onRegisterClick}
              className="px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-hover transition-colors shadow-sm"
            >
              {t('getStarted')}
            </button>
          </div>

          <div className="md:hidden flex items-center gap-1">
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 text-slate-500 hover:text-primary transition-colors"
              aria-label={t('search')}
            >
              <Search size={20} />
            </button>
            <button
              onClick={toggleDarkMode}
              className="p-2 text-slate-500 hover:text-primary transition-colors"
              aria-label={darkMode ? t('lightMode') : t('darkMode')}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2 text-slate-600 hover:text-primary transition-colors"
              aria-label={mobileOpen ? t('closeMenu') : t('openMenu')}
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 shadow-lg animate-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-4 space-y-1">
            {navLinks.map(link => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  setMobileOpen(false);
                  if (link.type === 'page') {
                    navigateTo(link.href);
                  } else {
                    scrollTo(link.href.slice(1));
                  }
                }}
                className="block w-full text-left px-4 py-3 text-sm font-semibold text-slate-600 hover:text-primary hover:bg-slate-50 rounded-xl transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
