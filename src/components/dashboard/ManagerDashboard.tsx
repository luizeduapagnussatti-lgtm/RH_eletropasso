import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { ShieldCheck, Plus, Users } from 'lucide-react';
import { DashboardData } from '../../hooks/dashboard/useDashboard';
import { DashboardHeader } from './DashboardHeader';
import { DashboardStats } from './DashboardStats';
import { AnnouncementWidget } from './AnnouncementWidget';

interface Props {
  data: DashboardData;
  isLoading: boolean;
  onNavigate: (path: string, params?: any) => void;
}

export const ManagerDashboard: React.FC<Props> = ({ data, isLoading, onNavigate }) => {
  const { t } = useTranslation('dashboard');
  const balanceTypes = data.leaveTypes?.filter(lt => lt.hasBalance) || [];
  const totalRemaining = balanceTypes.reduce((sum, lt) => sum + ((data.userBalance?.[lt.id] as number) || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
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
        <>
          <div className="bg-white rounded-xl border border-slate-100 shadow-xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="bg-primary p-8 pb-12 relative overflow-hidden flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-white tracking-tight mt-4">{t('leaveAllocation')}</h2>
              <ShieldCheck className="text-white/20 absolute -right-4 -bottom-4 w-32 h-32" />
            </div>

            <div className="px-8 -mt-6">
              <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-lg space-y-8">
                <div className="flex justify-around items-center divide-x divide-slate-100">
                  {balanceTypes.map(lt => (
                    <div key={lt.id} className="text-center flex-1">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">{lt.name}</p>
                      <p className="text-2xl font-semibold text-primary">{(data.userBalance?.[lt.id] as number) || 0}</p>
                    </div>
                  ))}
                </div>

                <p className="text-center text-sm text-slate-500 font-medium">
                  <Trans
                    i18nKey="dashboard:totalDaysRemaining"
                    values={{ count: totalRemaining }}
                    components={{ strong: <span className="font-semibold text-slate-900" /> }}
                  />
                </p>

                <button
                  onClick={() => onNavigate('leave', { autoOpen: true })}
                  className="w-full py-5 bg-primary text-white rounded-2xl font-semibold uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-xl shadow-primary-light hover:bg-primary-hover transition-all active:scale-95"
                >
                  <Plus size={18} /> {t('applyLeave')}
                </button>
              </div>
            </div>
            <div className="h-6"></div>
          </div>

          <div
            className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between transition-all cursor-pointer hover:bg-slate-50"
            onClick={() => onNavigate('employees')}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                <Users size={24} />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 leading-none">{t('teamDirectory')}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                  {data.teamInfo?.name || data.freshUser.department}
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
