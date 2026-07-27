
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  List,
  CalendarDays,
  Network,
  BarChart3,
  Settings,
  UserCircle,
  CalendarRange,
  type LucideIcon,
} from 'lucide-react';
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

const navTileClass =
  'group relative flex flex-col items-center justify-center gap-2 min-h-[4.5rem] px-2 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 font-semibold text-sm transition-all duration-200 ease-out motion-reduce:transition-none hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary-light/35 hover:text-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:hover:translate-y-0';

function NavTile({
  icon: Icon,
  label,
  onClick,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button type="button" onClick={onClick} className={navTileClass} aria-label={label}>
      {badge != null && badge > 0 ? (
        <span className="absolute top-1.5 right-1.5 min-w-[1.25rem] h-5 px-1 rounded-md bg-[#c41e24] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
      <Icon
        size={20}
        className="text-[#e23d42]/80 group-hover:text-[#c41e24] transition-colors duration-200"
        aria-hidden
      />
      <span className="truncate max-w-full px-0.5">{label}</span>
    </button>
  );
}

export const AdminDashboard: React.FC<Props> = ({ data, isLoading, onNavigate }) => {
  const { t } = useTranslation('dashboard');

  return (
    <div className="space-y-8 animate-in fade-in duration-300 motion-reduce:animate-none">
      <DashboardHeader
        user={data.freshUser}
        activeShift={data.activeShift}
        appConfig={data.appConfig}
        isLoading={isLoading}
        onNavigate={onNavigate}
        showPunchActions={false}
      />

      <DashboardStats
        variant="ops"
        presentToday={data.activeTeamMembers}
        teamCount={data.teamMembersCount}
        pendingLeaveCount={data.pendingLeaveCount}
        lateTodayCount={data.lateTodayCount}
        upcomingHoliday={data.upcomingHoliday}
        isLoading={isLoading}
        onNavigate={onNavigate}
      />

      <SetupChecklist user={data.freshUser} onNavigate={onNavigate} />

      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2 px-0.5">{t('management')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <NavTile
              icon={List}
              label={t('audit')}
              onClick={() => onNavigate('attendance-audit')}
            />
            <NavTile
              icon={CalendarRange}
              label={t('timesheet')}
              onClick={() => onNavigate('timesheet')}
            />
            <NavTile
              icon={CalendarDays}
              label={t('leave')}
              onClick={() => onNavigate('leave')}
              badge={data.pendingLeaveCount}
            />
            <NavTile
              icon={Users}
              label={t('directory')}
              onClick={() => onNavigate('employees')}
            />
            <NavTile
              icon={Network}
              label={t('org')}
              onClick={() => onNavigate('organization')}
            />
            <NavTile
              icon={BarChart3}
              label={t('reports')}
              onClick={() => onNavigate('reports')}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2 px-0.5">{t('personal')}</p>
          <div
            className={`grid gap-2 ${
              data.freshUser?.role === 'ADMIN' ? 'grid-cols-2' : 'grid-cols-1 max-w-xs'
            }`}
          >
            <NavTile
              icon={UserCircle}
              label={t('profile')}
              onClick={() => onNavigate('profile')}
            />
            {data.freshUser?.role === 'ADMIN' && (
              <NavTile
                icon={Settings}
                label={t('settings')}
                onClick={() => onNavigate('settings')}
              />
            )}
          </div>
        </div>
      </div>

      {!isLoading && (
        <>
          <button
            type="button"
            className="w-full bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between gap-4 text-left transition-all duration-200 ease-out motion-reduce:transition-none hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md hover:bg-primary-light/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:hover:translate-y-0"
            onClick={() => onNavigate('employees')}
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 shrink-0 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center">
                <Users size={22} aria-hidden />
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-slate-900 leading-tight">{t('globalDirectory')}</h4>
                <p className="text-xs font-medium text-slate-500 mt-0.5">{t('organizationWide')}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-semibold text-slate-900 tabular-nums leading-none">
                {data.activeTeamMembers}
                <span className="text-sm font-medium text-slate-400">/{data.teamMembersCount}</span>
              </p>
              <p className="text-xs font-medium text-emerald-700 mt-1">{t('presentTodayLabel')}</p>
            </div>
          </button>

          <AnnouncementWidget user={data.freshUser} onNavigate={onNavigate} />
        </>
      )}
    </div>
  );
};
