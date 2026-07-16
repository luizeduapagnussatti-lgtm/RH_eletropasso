import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Plus, Trash2, Edit, Star, CalendarClock, Users } from 'lucide-react';
import { Shift, ShiftOverride, Employee } from '../../types';

interface Props {
  shifts: Shift[];
  overrides: ShiftOverride[];
  employees: Employee[];
  onAddShift: () => void;
  onEditShift: (index: number) => void;
  onDeleteShift: (index: number) => void;
  onAddOverride: () => void;
  onDeleteOverride: (index: number) => void;
}

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_FULL: Record<(typeof DAY_KEYS)[number], string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export const OrgShifts: React.FC<Props> = ({
  shifts, overrides, employees,
  onAddShift, onEditShift, onDeleteShift,
  onAddOverride, onDeleteOverride
}) => {
  const { t } = useTranslation('org');
  const { t: tCommon } = useTranslation('common');
  const getEmployeeName = (id: string) => employees.find(e => e.id === id)?.name || t('unknown');
  const getShiftName = (id: string) => shifts.find(s => s.id === id)?.name || t('unknownShift');
  const getAssignedCount = (shiftId: string) => employees.filter(e => e.shiftId === shiftId).length;

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      {/* Shifts Section */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 bg-primary text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Clock size={20} />
            <h3 className="text-sm font-semibold uppercase tracking-wider">{t('shiftDefinitions')}</h3>
          </div>
          <button onClick={onAddShift} className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all">
            <Plus size={18} />
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shifts.map((shift, i) => (
            <div key={shift.id} className="p-6 bg-slate-50 border border-slate-100 rounded-[2rem] space-y-4 group hover:bg-white hover:shadow-md transition-all relative">
              {shift.isDefault && (
                <div className="absolute top-4 right-4">
                  <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-[8px] font-semibold uppercase tracking-widest">
                    <Star size={10} /> {t('default')}
                  </span>
                </div>
              )}
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">{shift.name}</h4>
                <p className="text-[10px] font-bold text-slate-400 mt-1">
                  {shift.startTime} — {shift.endTime}
                </p>
                {shift.daySchedules && Object.keys(shift.daySchedules).length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {(Object.entries(shift.daySchedules) as [string, { startTime: string; endTime: string }][]).map(([day, sched]) => (
                      <p key={day} className="text-[9px] font-semibold text-indigo-500">
                        {tCommon(`weekdaysShort.${day.toLowerCase()}`)} {sched.startTime} — {sched.endTime}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white p-2.5 rounded-xl border border-slate-100/50">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest">{t('lateGrace')}</p>
                  <p className="text-xs font-semibold text-slate-700">{t('minutesAbbr', { count: shift.lateGracePeriod })}</p>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-100/50">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest">{t('earlyOut')}</p>
                  <p className="text-xs font-semibold text-slate-700">{t('minutesAbbr', { count: shift.earlyOutGracePeriod })}</p>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-100/50">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest">{t('breakLabel')}</p>
                  <p className="text-xs font-semibold text-slate-700">{t('minutesAbbr', { count: shift.breakDurationMinutes ?? 60 })}</p>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-100/50">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest">{t('dailyLoad')}</p>
                  <p className="text-xs font-semibold text-slate-700">{t('minutesAbbr', { count: shift.expectedDailyMinutes ?? 480 })}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {DAY_KEYS.map(day => {
                  const isActive = shift.workingDays.includes(DAY_FULL[day]);
                  return (
                    <span key={day} className={`text-[8px] font-semibold px-2 py-1 rounded-lg ${isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-300'}`}>
                      {tCommon(`weekdaysShort.${day}`)}
                    </span>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100/50">
                <div className="flex items-center gap-1 text-slate-400">
                  <Users size={12} />
                  <span className="text-[9px] font-bold">{t('assignedCount', { count: getAssignedCount(shift.id) })}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onEditShift(i)} className="p-1.5 text-slate-400 hover:text-primary"><Edit size={14}/></button>
                  <button onClick={() => onDeleteShift(i)} className="p-1.5 text-slate-400 hover:text-rose-500"><Trash2 size={14}/></button>
                </div>
              </div>
            </div>
          ))}
          {shifts.length === 0 && (
            <p className="col-span-full text-center text-slate-400 py-10 font-bold uppercase text-xs">
              {t('noShifts')}
            </p>
          )}
        </div>
      </div>

      {/* Overrides Section */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-800 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <CalendarClock size={20} />
            <h3 className="text-sm font-semibold uppercase tracking-wider">{t('tempShiftOverrides')}</h3>
          </div>
          <button onClick={onAddOverride} className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all">
            <Plus size={18} />
          </button>
        </div>
        <div className="p-6 space-y-3">
          {overrides.map((ov, i) => (
            <div key={ov.id} className="p-5 bg-slate-50 border border-slate-100 rounded-[2rem] flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-white transition-all">
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-900 text-sm">{getEmployeeName(ov.employeeId)}</h4>
                <p className="text-[10px] font-bold text-primary">{getShiftName(ov.shiftId)}</p>
                <p className="text-[10px] font-bold text-slate-400">
                  {t('dateRangeTo', { start: ov.startDate, end: ov.endDate })}
                  {ov.reason && <span className="ml-2 text-slate-300">— {ov.reason}</span>}
                </p>
              </div>
              <button onClick={() => onDeleteOverride(i)} className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {overrides.length === 0 && (
            <p className="text-center text-slate-400 py-10 font-bold uppercase text-xs">
              {t('noShiftOverrides')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
