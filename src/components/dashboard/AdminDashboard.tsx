import React from 'react';
import { useTranslation } from 'react-i18next';
import { Users, List, CalendarDays, Network, BarChart3, Settings, UserCircle } from 'lucide-react';
import { DashboardData } from '../../hooks/dashboard/useDashboard';
import { DashboardHeader } from './DashboardHeader';
import { DashboardStats } from './DashboardStats';
import { AnnouncementWidget } from './AnnouncementWidget';
import SetupChecklist from '../onboarding/SetupChecklist';

interface Props {
  data: DashboardData;
  isLoading: boolean;
  onNavigate: (path: string, params?: any) => void;
}

export const AdminDashboard: React.FC<Props> = ({ data, isLoading, onNavigate }) => {
  const { t } = useTranslation('dashboard');

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <DashboardHeader
        user={data.freshUser}
        activeShift={data.activeShift}
        appConfig={data.appConfig}
        isLoading={isLoading}
        onNavigate={onNavigate}
        showPunchActions={false}
      />

      <DashboardStats
        leaveUsed={data.leaveUsed}
        upcomingHoliday={data.upcomingHoliday}
        isLoading={isLoading}
      />

      <SetupChecklist user={data.freshUser} onNavigate={onNavigate} />

      <div className="space-y-2">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">{t('management')}</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => onNavigate('attendance-audit')}
              className="py-3 px-2 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 hover:bg-white"
            >
              <List size={16} /> <span className="truncate">{t('audit')}</span>
            </button>
            <button
              onClick={() => onNavigate('leave')}
              className="py-3 px-2 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 hover:bg-white"
            >
              <CalendarDays size={16} /> <span className="truncate">{t('leave')}</span>
            </button>
            <button
              onClick={() => onNavigate('employees')}
              className="py-3 px-2 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 hover:bg-white"
            >
              <Users size={16} /> <span className="truncate">{t('directory')}</span>
            </button>
            <button
              onClick={() => onNavigate('organization')}
              className="py-3 px-2 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 hover:bg-white"
            >
              <Network size={16} /> <span className="truncate">{t('org')}</span>
            </button>
            <button
              onClick={() => onNavigate('reports')}
              className="py-3 px-2 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 hover:bg-white"
            >
              <BarChart3 size={16} /> <span className="truncate">{t('reports')}</span>
            </button>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">{t('personal')}</p>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => onNavigate('profile')}
              className="py-3 px-2 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 hover:bg-white"
            >
              <UserCircle size={16} /> <span className="truncate">{t('profile')}</span>
            </button>
            {data.freshUser?.role === 'ADMIN' && (
              <button
                onClick={() => onNavigate('settings')}
                className="py-3 px-2 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 hover:bg-white"
              >
                <Settings size={16} /> <span className="truncate">{t('settings')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {!isLoading && (
        <>
          <div
            className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between transition-all cursor-pointer hover:bg-slate-50"
            onClick={() => onNavigate('employees')}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                <Users size={24} />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 leading-none">{t('globalDirectory')}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                  {t('organizationWide')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-emerald-600">{t('active', { count: data.activeTeamMembers })}</p>
              <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">{t('outOf', { count: data.teamMembersCount })}</p>
            </div>
          </div>

          <AnnouncementWidget user={data.freshUser} onNavigate={onNavigate} />
        </>
      )}
    </div>
  );
};
