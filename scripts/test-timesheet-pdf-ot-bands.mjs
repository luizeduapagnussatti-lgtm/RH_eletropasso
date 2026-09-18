/**
 * PDF mirror OT bands (HE 60% / HE 100%).
 * Run: npx vite-node scripts/test-timesheet-pdf-ot-bands.mjs
 */
import assert from 'node:assert/strict';
import { overtimeBandsForTimesheetDay } from '../src/services/timesheetPdfExport.service.ts';
import { minutesToDisplay } from '../src/utils/durationHm.ts';

// Weekday 2h40 → 2h @ 60% + 40min @ 100%
{
  const r = overtimeBandsForTimesheetDay({
    workDate: '2026-07-28', // Tuesday
    overtimeMinutes: 160,
    status: 'OK',
  });
  assert.equal(r.extra50Minutes, 120);
  assert.equal(r.extra100Minutes, 40);
  assert.equal(minutesToDisplay(r.extra50Minutes), '02:00');
  assert.equal(minutesToDisplay(r.extra100Minutes), '00:40');
}

// Weekday exactly 2h → all 60%
{
  const r = overtimeBandsForTimesheetDay({
    workDate: '2026-07-28',
    overtimeMinutes: 120,
    status: 'OK',
  });
  assert.equal(r.extra50Minutes, 120);
  assert.equal(r.extra100Minutes, 0);
  assert.equal(minutesToDisplay(r.extra100Minutes), '—');
}

// Sunday → 100% only
{
  const r = overtimeBandsForTimesheetDay({
    workDate: '2026-07-26', // Sunday
    overtimeMinutes: 90,
    status: 'OFF',
  });
  assert.equal(r.extra50Minutes, 0);
  assert.equal(r.extra100Minutes, 90);
}

// Holiday weekday → 100% only
{
  const r = overtimeBandsForTimesheetDay({
    workDate: '2026-07-28',
    overtimeMinutes: 60,
    status: 'HOLIDAY',
  });
  assert.equal(r.extra50Minutes, 0);
  assert.equal(r.extra100Minutes, 60);
}

console.log('test-timesheet-pdf-ot-bands: ok');
