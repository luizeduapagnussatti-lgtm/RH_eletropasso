import React from 'react';
import { useTranslation } from 'react-i18next';
import { Fingerprint, ArrowRight, Building2 } from 'lucide-react';
import { Employee, Attendance, AppConfig } from '../../types';

interface Props {
  user: Employee;
  activeShift?: Attendance;
  appConfig: AppConfig | null;
  isLoading: boolean;
  onNavigate: (path: string) => void;
  /** When false, hide punch shortcut (admin / HR / not allowed for PWA punch). */
  showPunchActions?: boolean;
}

export const DashboardHeader: React.FC<Props> = ({
  user, appConfig, isLoading, onNavigate, showPunchActions = true,
}) => {
  const { t } = useTranslation('dashboard');

  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 md:gap-6">
      <div>
        {appConfig?.companyName && (
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={12} className="text-primary" />
            <p className="text-[10px] font-semibold text-primary uppercase tracking-[0.2em]">{appConfig.companyName}</p>
          </div>
        )}
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">{user.name}</h1>
        <p className="text-xs font-bold text-slate-400 mt-0.5">
          {user.designation} {user.department && user.department !== 'Unassigned' && `• ${user.department}`}
        </p>
      </div>

      {showPunchActions && (
        <div className="flex items-center gap-3">
          {isLoading ? (
            <div className="w-48 h-16 bg-slate-100 rounded-[1.5rem] animate-pulse" />
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('pwa-punch')}
              className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3 md:py-4 bg-primary text-white rounded-2xl md:rounded-[1.5rem] shadow-lg shadow-primary-light hover:bg-primary-hover transition-all group active:scale-95"
            >
              <Fingerprint size={18} aria-hidden />
              <div className="text-left">
                <p className="text-[9px] font-semibold text-white/80 uppercase tracking-widest leading-none mb-1">
                  {t('pwaPunchEyebrow')}
                </p>
                <p className="text-xs font-semibold text-white uppercase">{t('pwaPunchAction')}</p>
              </div>
              <ArrowRight size={16} className="text-white/70 group-hover:text-white transition-colors ml-2" />
            </button>
          )}
        </div>
      )}
    </header>
  );
};
