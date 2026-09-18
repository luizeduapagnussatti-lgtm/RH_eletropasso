import { syncAbsenceFromWorked } from './timesheetAdjust';
import type { TimesheetDay } from '../types';

/** Minutes shown in the Falta column (ADJUSTED always derived from worked). */
export function displayAbsenceMinutes(day: Pick<TimesheetDay, 'status' | 'expectedMinutes' | 'workedMinutes' | 'absenceMinutes'>): number {
  // Non-working / excused — never show as falta.
  if (day.status === 'OFF' || day.status === 'HOLIDAY' || day.status === 'LEAVE') {
    return 0;
  }
  // Open / missing-mark days are not a booked absence. Booking remaining hours
  // as FALTA made the PWA show ~15h "debt" while the driver was still on shift
  // (3rd punch = back from lunch, 4th not yet).
  if (day.status === 'INCOMPLETE') {
    return 0;
  }
  if (day.status === 'ADJUSTED') {
    return syncAbsenceFromWorked(day.expectedMinutes || 0, day.workedMinutes || 0);
  }
  return Math.max(0, day.absenceMinutes || 0);
}
