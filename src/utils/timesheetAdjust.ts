/** Sync absence when manager sets worked minutes on a manual adjustment. */
export function syncAbsenceFromWorked(expectedMinutes: number, workedMinutes: number): number {
  return Math.max(0, (expectedMinutes || 0) - Math.max(0, workedMinutes));
}
