import React from 'react';
import { useTranslation } from 'react-i18next';
import { Network, User, Plus, ArrowRight } from 'lucide-react';
import { DashboardData } from '../../hooks/dashboard/useDashboard';
import { DashboardHeader } from './DashboardHeader';
import { DashboardStats } from './DashboardStats';
import { AnnouncementWidget } from './AnnouncementWidget';

interface Props {
  data: DashboardData;
  isLoading: boolean;
  onNavigate: (path: string, params?: any) => void;
}

export const EmployeeDashboard: React.FC<Props> = ({ data, isLoading, onNavigate }) => {
  const { t } = useTranslation('dashboard');

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-700">
      <DashboardHeader
        user={data.freshUser}
        activeShift={data.activeShift}
        appConfig={data.appConfig}
        isLoading={isLoading}
        onNavigate={onNavigate}
      />

      <DashboardStats
        leaveUsed={data.leaveUsed}
        upcomingHoliday={data.upcomingHoliday}
        isLoading={isLoading}
      />

      {!isLoading && (
        <div className="grid grid-cols-2 gap-3 md:gap-4 animate-in slide-in-from-bottom-4">
          <div className="bg-white p-4 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center gap-1.5 min-h-[90px]">
            <div className="flex items-center gap-2 text-primary">
              <div className="p-1.5 bg-primary-light rounded-lg"><Network size={14} /></div>
              <span className="text-[8px] font-semibold uppercase tracking-widest text-slate-400">{t('team')}</span>
            </div>
            <h3 className="font-semibold text-slate-800 text-xs md:text-sm line-clamp-2 leading-tight pl-1" title={data.myTeamName}>
              {data.myTeamName}
            </h3>
          </div>

          <div className="bg-white p-4 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center gap-1.5 min-h-[90px]">
            <div className="flex items-center gap-2 text-primary">
              <div className="p-1.5 bg-primary-light rounded-lg"><User size={14} /></div>
              <span className="text-[8px] font-semibold uppercase tracking-widest text-slate-400">{t('manager')}</span>
            </div>
            <h3 className="font-semibold text-slate-800 text-xs md:text-sm line-clamp-2 leading-tight pl-1">
              {data.myManager?.name || t('noManager')}
            </h3>
          </div>

          <button
            onClick={() => onNavigate('leave', { autoOpen: true })}
            className="col-span-2 w-full py-3.5 px-5 bg-primary text-white rounded-2xl md:rounded-[1.5rem] shadow-lg shadow-primary-light/50 flex items-center justify-between active:scale-[0.98] transition-all group border border-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-white/20 backdrop-blur-md rounded-lg group-hover:rotate-90 transition-transform duration-500">
                <Plus size={14} className="text-white" />
              </div>
              <div className="text-left">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/90">{t('newRequest')}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[9px] font-bold opacity-80 group-hover:opacity-100 transition-opacity">
              <span>{t('applyLeave')}</span>
              <ArrowRight size={14} />
            </div>
          </button>
        </div>
      )}

      <AnnouncementWidget user={data.freshUser} onNavigate={onNavigate} />
    </div>
  );
};
