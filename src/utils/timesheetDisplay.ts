import { syncAbsenceFromWorked } from './timesheetAdjust';
import type { TimesheetDay } from '../types';

/** Minutes shown in the Falta column (ADJUSTED always derived from worked). */
export function displayAbsenceMinutes(day: Pick<TimesheetDay, 'status' | 'expectedMinutes' | 'workedMinutes' | 'absenceMinutes'>): number {
  if (day.status === 'ADJUSTED') {
    return syncAbsenceFromWorked(day.expectedMinutes || 0, day.workedMinutes || 0);
  }
  return Math.max(0, day.absenceMinutes || 0);
}
