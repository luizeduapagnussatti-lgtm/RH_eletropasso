/**
 * Brazilian duration display/edit: HH:mm (hours may exceed 23 for weekly loads).
 * Storage and calc stay in integer minutes.
 */

/** Format minutes as zero-padded HH:mm (allows hours > 23). Empty/NaN → "00:00". */
export function minutesToHm(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins)) return '00:00';
  const sign = mins < 0 ? '-' : '';
  const abs = Math.round(Math.abs(mins));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Format for timesheet/PDF cells: zero → em dash; otherwise signed HH:mm.
 */
export function minutesToDisplay(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins) || mins === 0) return '—';
  return minutesToHm(mins);
}

/**
 * Parse H:MM / HH:MM (hours uncapped). Returns null if invalid.
 */
export function hmToMinutes(value: string | null | undefined): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  let sign = 1;
  let body = raw;
  if (body.startsWith('-')) {
    sign = -1;
    body = body.slice(1).trim();
  } else if (body.startsWith('+')) {
    body = body.slice(1).trim();
  }

  const m = body.match(/^(\d{1,4}):([0-5]\d)$/);
  if (!m) return null;
  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return sign * (hours * 60 + minutes);
}
