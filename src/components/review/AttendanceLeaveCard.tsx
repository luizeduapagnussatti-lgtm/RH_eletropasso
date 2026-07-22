
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, CalendarOff } from 'lucide-react';
import { AttendanceSummary, LeaveSummary } from '../../types';

interface Props {
  attendance: AttendanceSummary;
  leave: LeaveSummary;
}

const StatItem: React.FC<{ label: string; value: number | string; color?: string }> = ({ label, value, color = 'text-slate-900' }) => (
  <div className="text-center">
    <p className={`text-lg font-bold ${color}`}>{value}</p>
    <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
  </div>
);

const AttendanceLeaveCard: React.FC<Props> = ({ attendance, leave }) => {
  const { t } = useTranslation('review');

  const leaveTypeLabel = (type: string) =>
    t(`leaveTypeLabels.${type}`, { defaultValue: type.charAt(0) + type.slice(1).toLowerCase() });

  // Build leave entries from typeBreakdown (new format) or legacy fields
  const leaveEntries: { label: string; value: number; color?: string }[] = [];

  if (leave.typeBreakdown && Object.keys(leave.typeBreakdown).length > 0) {
    for (const [type, days] of Object.entries(leave.typeBreakdown)) {
      leaveEntries.push({
        label: leaveTypeLabel(type),
        value: days,
        color: type === 'UNPAID' ? 'text-red-600' : undefined,
      });
    }
  } else {
    // Legacy format fallback
    if (leave.annualLeaveTaken !== undefined) leaveEntries.push({ label: t('leaveTypeLabels.ANNUAL'), value: leave.annualLeaveTaken || 0 });
    if (leave.casualLeaveTaken !== undefined) leaveEntries.push({ label: t('leaveTypeLabels.CASUAL'), value: leave.casualLeaveTaken || 0 });
    if (leave.sickLeaveTaken !== undefined) leaveEntries.push({ label: t('leaveTypeLabels.SICK'), value: leave.sickLeaveTaken || 0 });
    if (leave.unpaidLeaveTaken !== undefined) leaveEntries.push({ label: t('leaveTypeLabels.UNPAID'), value: leave.unpaidLeaveTaken || 0, color: 'text-red-600' });
  }

  return (
    <div className="space-y-4">
      {/* Attendance Summary */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-primary" />
          <h4 className="font-semibold text-slate-900 text-sm">{t('attendanceSummary')}</h4>
          <span className="ml-auto text-xs font-bold text-primary bg-primary-light/50 px-2.5 py-0.5 rounded-full">
            {attendance.attendancePercentage}%
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <StatItem label={t('workingDays')} value={attendance.totalWorkingDays} />
          <StatItem label={t('present')} value={attendance.presentDays} color="text-green-600" />
          <StatItem label={t('late')} value={attendance.lateDays} color="text-orange-600" />
          <StatItem label={t('absent')} value={attendance.absentDays} color="text-red-600" />
          <StatItem label={t('earlyOut')} value={attendance.earlyOutDays} color="text-yellow-600" />
        </div>
      </div>

      {/* Leave Summary */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarOff size={16} className="text-primary" />
          <h4 className="font-semibold text-slate-900 text-sm">{t('leaveSummary')}</h4>
          <span className="ml-auto text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
            {t('daysCount', { count: leave.totalLeaveDays })}
          </span>
        </div>
        <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${Math.min(leaveEntries.length || 1, 5)}, 1fr)` }}>
          {leaveEntries.map(entry => (
            <StatItem key={entry.label} label={entry.label} value={entry.value} color={entry.color} />
          ))}
          {leaveEntries.length === 0 && (
            <p className="text-xs text-slate-400 col-span-full text-center">{t('noLeaveData')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceLeaveCard;
