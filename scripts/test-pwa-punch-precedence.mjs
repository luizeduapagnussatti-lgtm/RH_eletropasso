/**
 * Pure unit checks: APP vs CLOCK precedence (PWA punch fills holes only).
 * Run: npx vite-node scripts/test-pwa-punch-precedence.mjs
 */
import assert from 'node:assert/strict';
import {
  planAppVsClockIgnores,
  planProximityAutoIgnores,
  punchesForApuration,
  PUNCH_PROXIMITY_DEDUP_MINUTES,
} from '../src/services/punch.service.ts';

assert.equal(PUNCH_PROXIMITY_DEDUP_MINUTES, 10);

const date = '2026-08-28';
const mk = (id, hm, source, direction = 'IN', extra = {}) => ({
  id,
  employeeId: 'e1',
  punchedAt: `2026-08-28T${hm}:00.000-03:00`,
  direction,
  source,
  ...extra,
});

// APP alone → counts (no ignore plan)
{
  const punches = [mk('app1', '08:00', 'APP')];
  const plan = planAppVsClockIgnores(punches, date);
  assert.deepEqual(plan.toIgnore, []);
  assert.deepEqual(plan.toClear, []);
  assert.equal(punchesForApuration(punches).length, 1);
}

// APP + CLOCK in window → ignore APP
{
  const punches = [mk('app1', '08:00', 'APP'), mk('clk1', '08:05', 'CLOCK')];
  const plan = planAppVsClockIgnores(punches, date);
  assert.deepEqual(plan.toIgnore, ['app1']);
  assert.deepEqual(plan.toClear, []);
}

// CLOCK later than APP (same window) → ignore APP
{
  const punches = [mk('app1', '07:50', 'APP'), mk('clk1', '07:58', 'CLOCK')];
  const plan = planAppVsClockIgnores(punches, date);
  assert.deepEqual(plan.toIgnore, ['app1']);
}

// APP outside window of CLOCK → keep APP
{
  const punches = [mk('app1', '08:00', 'APP'), mk('clk1', '12:00', 'CLOCK', 'OUT')];
  const plan = planAppVsClockIgnores(punches, date);
  assert.deepEqual(plan.toIgnore, []);
}

// Clear AUTO ignore when CLOCK disappears from window
{
  const punches = [
    mk('app1', '08:00', 'APP', 'IN', { ignoredForCalc: true, ignoreSource: 'AUTO' }),
  ];
  const plan = planAppVsClockIgnores(punches, date);
  assert.deepEqual(plan.toIgnore, []);
  assert.deepEqual(plan.toClear, ['app1']);
}

// MANUAL ignore on APP is never cleared/overridden by this plan
{
  const punches = [
    mk('app1', '08:00', 'APP', 'IN', { ignoredForCalc: true, ignoreSource: 'MANUAL' }),
    mk('clk1', '08:02', 'CLOCK'),
  ];
  const plan = planAppVsClockIgnores(punches, date);
  assert.deepEqual(plan.toIgnore, []);
  assert.deepEqual(plan.toClear, []);
}

// CLOCK proximity dedupe still independent
{
  const punches = [mk('a', '07:45', 'CLOCK'), mk('b', '07:55', 'CLOCK')];
  const plan = planProximityAutoIgnores(punches, date);
  assert.deepEqual(plan.toIgnore, ['b']);
}

console.log('test-pwa-punch-precedence: ok');
