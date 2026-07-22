import React from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Gift } from 'lucide-react';
import { Holiday } from '../../types';
import { formatDate } from '../../i18n/format';

interface Props {
  leaveUsed: number;
  upcomingHoliday: Holiday | null;
  isLoading: boolean;
  compact?: boolean;
}

const SkeletonCard = () => (
  <div className="bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm animate-pulse flex flex-col gap-3">
    <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-100 rounded-xl"></div>
    <div className="space-y-2">
      <div className="h-5 md:h-6 bg-slate-100 rounded-lg w-3/4"></div>
      <div className="h-2 md:h-3 bg-slate-50 rounded-lg w-1/2"></div>
    </div>
  </div>
);

export const DashboardStats: React.FC<Props> = ({ leaveUsed, upcomingHoliday, isLoading }) => {
  const { t } = useTranslation('dashboard');

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4">
      <div className="bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3">
        <div className="w-8 h-8 md:w-10 md:h-10 bg-primary-light text-primary rounded-xl flex items-center justify-center">
          <CalendarDays size={18} className="md:w-5 md:h-5" />
        </div>
        <div>
          <h3 className="text-lg md:text-xl font-semibold text-slate-900 leading-none">
            {t('leaveUsedDays', { count: leaveUsed })}
          </h3>
          <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-tight">
            {t('leaveUsedLabel')}
          </p>
        </div>
      </div>
      <div className="bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3">
        <div className="w-8 h-8 md:w-10 md:h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
          <Gift size={18} className="md:w-5 md:h-5" />
        </div>
        <div>
          <h3 className="text-lg md:text-xl font-semibold text-slate-900 leading-none truncate">
            {upcomingHoliday
              ? formatDate(upcomingHoliday.date, { month: 'short', day: 'numeric' })
              : t('noHolidayDate')}
          </h3>
          <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-tight truncate">
            {upcomingHoliday ? upcomingHoliday.name : t('noHolidays')}
          </p>
        </div>
      </div>
    </div>
  );
};
