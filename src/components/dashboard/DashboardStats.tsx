import React from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Gift, Users, ClipboardList, UserCheck, Clock } from 'lucide-react';
import { Holiday } from '../../types';
import { formatDate } from '../../i18n/format';

interface PersonalProps {
  variant?: 'personal';
  leaveUsed: number;
  upcomingHoliday: Holiday | null;
  isLoading: boolean;
}

interface OpsProps {
  variant: 'ops';
  presentToday: number;
  teamCount: number;
  pendingLeaveCount: number;
  lateTodayCount: number;
  upcomingHoliday: Holiday | null;
  isLoading: boolean;
  onNavigate?: (path: string, params?: Record<string, unknown>) => void;
}

type Props = PersonalProps | OpsProps;

const SkeletonCard = () => (
  <div className="bg-white p-4 md:p-5 rounded-xl border border-slate-100 shadow-sm animate-pulse flex flex-col gap-3">
    <div className="w-9 h-9 bg-slate-100 rounded-lg" />
    <div className="space-y-2">
      <div className="h-7 bg-slate-100 rounded-lg w-3/4" />
      <div className="h-3 bg-slate-50 rounded-lg w-1/2" />
    </div>
  </div>
);

const cardBase =
  'bg-white p-4 md:p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-3 transition-all duration-200 ease-out motion-reduce:transition-none';

const cardInteractive =
  'cursor-pointer hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md hover:bg-primary-light/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:hover:translate-y-0';

export const DashboardStats: React.FC<Props> = (props) => {
  const { t } = useTranslation('dashboard');
  const isLoading = props.isLoading;

  if (isLoading) {
    const cols = props.variant === 'ops' ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2';
    return (
      <div className={`grid ${cols} gap-3`}>
        <SkeletonCard />
        <SkeletonCard />
        {props.variant === 'ops' ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : null}
      </div>
    );
  }

  if (props.variant === 'ops') {
    const { presentToday, teamCount, pendingLeaveCount, lateTodayCount, upcomingHoliday, onNavigate } = props;
    const go = (path: string) => onNavigate?.(path);

    return (
      <section aria-label={t('todaySnapshot')} className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 px-0.5">{t('todaySnapshot')}</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => go('attendance-audit')}
            className={`${cardBase} ${cardInteractive} text-left`}
          >
            <div className="w-9 h-9 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center">
              <UserCheck size={18} aria-hidden />
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-semibold text-slate-900 tabular-nums leading-none">
                {presentToday}
                <span className="text-base font-medium text-slate-400">/{teamCount}</span>
              </p>
              <p className="text-xs font-medium text-slate-500 mt-1.5">{t('presentTodayLabel')}</p>
              {lateTodayCount > 0 ? (
                <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                  <Clock size={12} aria-hidden />
                  {t('lateCount', { count: lateTodayCount })}
                </p>
              ) : null}
            </div>
          </button>

          <button
            type="button"
            onClick={() => go('leave')}
            className={`${cardBase} ${cardInteractive} text-left ${
              pendingLeaveCount > 0 ? 'border-[#c41e24]/25' : ''
            }`}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                pendingLeaveCount > 0
                  ? 'bg-[#c41e24]/10 text-[#c41e24]'
                  : 'bg-primary-light text-primary'
              }`}
            >
              <ClipboardList size={18} aria-hidden />
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-semibold text-slate-900 tabular-nums leading-none">
                {pendingLeaveCount}
              </p>
              <p className="text-xs font-medium text-slate-500 mt-1.5">{t('pendingLeavesLabel')}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => go('employees')}
            className={`${cardBase} ${cardInteractive} text-left`}
          >
            <div className="w-9 h-9 bg-primary-light text-primary rounded-lg flex items-center justify-center">
              <Users size={18} aria-hidden />
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-semibold text-slate-900 tabular-nums leading-none">
                {teamCount}
              </p>
              <p className="text-xs font-medium text-slate-500 mt-1.5">{t('teamHeadcountLabel')}</p>
            </div>
          </button>

          <div className={`${cardBase}`}>
            <div className="w-9 h-9 bg-amber-50 text-amber-700 rounded-lg flex items-center justify-center">
              <Gift size={18} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-2xl md:text-3xl font-semibold text-slate-900 leading-none truncate">
                {upcomingHoliday
                  ? formatDate(upcomingHoliday.date, { month: 'short', day: 'numeric' })
                  : t('noHolidayDate')}
              </p>
              <p className="text-xs font-medium text-slate-500 mt-1.5 truncate">
                {upcomingHoliday ? upcomingHoliday.name : t('noHolidays')}
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const { leaveUsed, upcomingHoliday } = props;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className={cardBase}>
        <div className="w-9 h-9 bg-primary-light text-primary rounded-lg flex items-center justify-center">
          <CalendarDays size={18} aria-hidden />
        </div>
        <div>
          <h3 className="text-xl md:text-2xl font-semibold text-slate-900 leading-none tabular-nums">
            {t('leaveUsedDays', { count: leaveUsed })}
          </h3>
          <p className="text-xs font-medium text-slate-500 mt-1.5">{t('leaveUsedLabel')}</p>
        </div>
      </div>
      <div className={cardBase}>
        <div className="w-9 h-9 bg-amber-50 text-amber-700 rounded-lg flex items-center justify-center">
          <Gift size={18} aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-xl md:text-2xl font-semibold text-slate-900 leading-none truncate">
            {upcomingHoliday
              ? formatDate(upcomingHoliday.date, { month: 'short', day: 'numeric' })
              : t('noHolidayDate')}
          </h3>
          <p className="text-xs font-medium text-slate-500 mt-1.5 truncate">
            {upcomingHoliday ? upcomingHoliday.name : t('noHolidays')}
          </p>
        </div>
      </div>
    </div>
  );
};
