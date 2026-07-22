import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, X, LayoutDashboard, Clock, CalendarDays, UserCircle, Sun, Moon } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import NotificationBell from '../components/notifications/NotificationBell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { SubscriptionBanner } from '../components/subscription';
import { APP_NAME, STORE_LOGO_PATH } from '../config/branding';
import { isNonPunchingStaff } from '../utils/roles';


interface MainLayoutProps {
  children: React.ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, currentPath, onNavigate }) => {
  const { t } = useTranslation(['common', 'nav']);
  const { user, logout } = useAuth();
  const { darkMode, setDarkModePreference } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const historyPath = isNonPunchingStaff(user?.role) ? 'attendance-audit' : 'attendance-logs';

  const handleNavigate = (path: string) => {
    onNavigate(path);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    onNavigate('dashboard'); // Reset path on logout
  };

  if (!user) return null;

  return (
    <div className="flex bg-[#fcfdfe] min-h-screen relative overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-white focus:font-semibold focus:shadow-lg"
      >
        {t('skipToContent')}
      </a>
      {/* Mobile Overlay */}
      <div 
        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] md:hidden transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* Sidebar */}
      <div className={`fixed h-full z-[70] transition-transform duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar 
          currentPath={currentPath} 
          onNavigate={handleNavigate} 
          onLogout={handleLogout} 
          role={user.role} 
          user={user}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-80 flex flex-col min-h-screen max-w-full overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-[#182230] border-b border-[#243044] flex items-center justify-between gap-2 px-4 sm:px-6 md:px-10 sticky top-0 z-40">
           <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 -ml-2 text-[#e23d42]/80 md:hidden hover:bg-white/5 hover:text-[#e23d42] rounded-xl transition-all flex-shrink-0"
              >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>

              <div className="flex items-center min-w-0">
                 {/* Eletropasso store wordmark — replaces former cloud-node badge */}
                 <div className="flex items-center bg-black rounded-xl px-3 py-1.5 md:px-4 md:py-2 shadow-sm border border-slate-800 max-w-[200px] sm:max-w-[260px] md:max-w-[320px]">
                    <img
                      src={STORE_LOGO_PATH}
                      className="h-7 sm:h-8 md:h-9 w-auto max-w-full object-contain"
                      alt="Eletropasso"
                    />
                 </div>
                 <span className="sr-only">{APP_NAME}</span>
              </div>
           </div>

           <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={() => setDarkModePreference(darkMode ? 'light' : 'dark')}
                className="p-2.5 rounded-xl text-[#e23d42]/75 hover:text-[#e23d42] hover:bg-white/5 transition-all flex-shrink-0"
                title={darkMode ? t('theme.toLight') : t('theme.toDark')}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <NotificationBell onNavigate={handleNavigate} chrome />
              <div
                className="cursor-pointer flex-shrink-0"
                onClick={() => handleNavigate('profile')}
              >
                <img
                  src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}`}
                  className="w-10 h-10 rounded-full bg-[#0f1620] object-cover ring-2 ring-transparent hover:ring-[#c41e24] transition-all shadow-sm flex-shrink-0"
                  alt="Profile"
                  width={40}
                  height={40}
                />
              </div>
           </div>
        </header>

        {/* Subscription Banner - visible to all org users */}
        <SubscriptionBanner onUpgradeClick={() => handleNavigate('upgrade')} userRole={user.role} />

        {/* Content */}
        <div id="main-content" className="flex-1 p-6 md:p-12 w-full pb-28 md:pb-12 overflow-x-hidden">
          <div className="max-w-4xl mx-auto w-full">
            {children}
          </div>

        </div>

        {/* Bottom Navigation (Mobile) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-2xl border-t border-slate-100 flex items-center justify-around p-4 z-50 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button 
            onClick={() => handleNavigate('dashboard')}
            className={`flex flex-col items-center gap-1 transition-all ${currentPath === 'dashboard' ? 'text-primary' : 'text-slate-400'}`}
          >
            <LayoutDashboard size={20} className={currentPath === 'dashboard' ? 'scale-110' : ''} />
            <span className="text-[9px] font-semibold uppercase tracking-tighter">{t('nav:mobile.home')}</span>
          </button>
          <button 
            onClick={() => handleNavigate(historyPath)}
            className={`flex flex-col items-center gap-1 transition-all ${currentPath === 'attendance-logs' || currentPath === 'attendance-audit' ? 'text-primary' : 'text-slate-400'}`}
          >
            <Clock size={20} className={currentPath === 'attendance-logs' || currentPath === 'attendance-audit' ? 'scale-110' : ''} />
            <span className="text-[9px] font-semibold uppercase tracking-tighter">{t('nav:mobile.history')}</span>
          </button>
          <button 
            onClick={() => handleNavigate('leave')}
            className={`flex flex-col items-center gap-1 transition-all ${currentPath === 'leave' ? 'text-primary' : 'text-slate-400'}`}
          >
            <CalendarDays size={20} className={currentPath === 'leave' ? 'scale-110' : ''} />
            <span className="text-[9px] font-semibold uppercase tracking-tighter">{t('nav:mobile.leave')}</span>
          </button>
          <button 
            onClick={() => handleNavigate('profile')}
            className={`flex flex-col items-center gap-1 transition-all ${currentPath === 'profile' ? 'text-primary' : 'text-slate-400'}`}
          >
            <UserCircle size={20} className={currentPath === 'profile' ? 'scale-110' : ''} />
            <span className="text-[9px] font-semibold uppercase tracking-tighter">{t('nav:mobile.account')}</span>
          </button>
        </nav>
      </main>
    </div>
  );
};

export default MainLayout;
