import { applyJourneyThreshold } from '../services/timeCalculation.service';

/** Sync absence when manager sets worked minutes on a manual adjustment. */
export function syncAbsenceFromWorked(expectedMinutes: number, workedMinutes: number): number {
  return applyJourneyThreshold((expectedMinutes || 0) - Math.max(0, workedMinutes));
}
