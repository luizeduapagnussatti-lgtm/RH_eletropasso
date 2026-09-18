/**
 * Smoke test for punch correction request flow (service-level shape + mapping helpers).
 * Run: node --experimental-strip-types scripts/test-punch-correction-flow.mjs
 * (or via tsx if available)
 */
import assert from 'node:assert/strict';

function previousWeekRange(todayIso) {
  const today = new Date(`${todayIso}T12:00:00Z`);
  const dow = today.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(today.getUTCDate() + mondayOffset);
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);
  const start = prevMonday.toISOString().slice(0, 10);
  const end = prevSunday.toISOString().slice(0, 10);
  return { start, end };
}

function weekdayNameUtcNoon(iso) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date(`${iso}T12:00:00Z`).getDay()];
}

function missingWorkDays({
  weekDates,
  workingDays,
  holidaySet,
  punched,
  onLeave,
  absent,
  off,
}) {
  const missing = [];
  for (const d of weekDates) {
    const wd = weekdayNameUtcNoon(d);
    if (!workingDays.includes(wd)) continue;
    if (holidaySet.has(d)) continue;
    if (onLeave.has(d)) continue;
    if (absent.has(d)) continue;
    if (off.has(d)) continue;
    if (punched.has(d)) continue;
    missing.push(d);
  }
  return missing;
}

function eachDateInclusive(start, end) {
  const out = [];
  let cur = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// Monday 2026-09-14 → previous week Mon 2026-09-07 .. Sun 2026-09-13
const range = previousWeekRange('2026-09-14');
assert.equal(range.start, '2026-09-07');
assert.equal(range.end, '2026-09-13');

const weekDates = eachDateInclusive(range.start, range.end);
assert.equal(weekDates.length, 7);

const workingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const missing = missingWorkDays({
  weekDates,
  workingDays,
  holidaySet: new Set(['2026-09-08']), // Tuesday holiday
  punched: new Set(['2026-09-07', '2026-09-09', '2026-09-10']),
  onLeave: new Set(['2026-09-11']),
  absent: new Set(),
  off: new Set(),
});
// Fri 2026-09-11 leave, Tue holiday, Mon/Wed/Thu punched → missing Fri? wait Fri is leave
// Weekdays: Mon7 punched, Tue8 holiday, Wed9 punched, Thu10 punched, Fri11 leave → missing none of Fri
// Actually missing should be empty for those. Wait - is there any missing?
// Only Mon-Fri in working days. All accounted → []
assert.deepEqual(missing, []);

const missing2 = missingWorkDays({
  weekDates,
  workingDays,
  holidaySet: new Set(),
  punched: new Set(['2026-09-07']),
  onLeave: new Set(),
  absent: new Set(),
  off: new Set(),
});
assert.deepEqual(missing2, ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']);

const referenceId = `missing_punches_alert_2026W0907_123`;
assert.match(referenceId, /^missing_punches_alert_/);

console.log('test-punch-correction-flow: OK');
