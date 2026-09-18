/**
 * Contract: punch collect accept + lock helpers.
 * Run: npx vite-node scripts/test-clock-collect-async.mjs
 */
import assert from 'node:assert/strict';
import {
  isSyncLocked,
  tryAcquireSyncLock,
  releaseSyncLock,
  withSyncLock,
} from '../services/dmprep-sync/src/syncLock.ts';
import {
  getClockCollectState,
  isClockCollectActive,
  startClockCollect,
  acknowledgeClockCollectResult,
  configureClockCollectFormatters,
} from '../src/services/clockCollectSession.ts';

// --- syncLock ---
assert.equal(isSyncLocked(), false);
assert.equal(tryAcquireSyncLock(), true);
assert.equal(isSyncLocked(), true);
assert.equal(tryAcquireSyncLock(), false);
releaseSyncLock();
assert.equal(isSyncLocked(), false);

const busy = await withSyncLock(async () => {
  assert.equal(isSyncLocked(), true);
  return 'ok';
});
assert.equal(busy, 'ok');
assert.equal(isSyncLocked(), false);

const parallel = await withSyncLock(async () => {
  const inner = await withSyncLock(async () => 'nested');
  assert.deepEqual(inner, { busy: true });
  return 'outer';
});
assert.equal(parallel, 'outer');

// --- clockCollectSession (mock) ---
configureClockCollectFormatters({
  formatSuccess: (c) => `ok:${c.inserted}`,
  formatFailure: (m) => `fail:${m}`,
});

let busyFlag = false;
let finishedAt = null;
const started = await startClockCollect({
  scope: 'punches',
  trigger: async () => {
    busyFlag = true;
    return { accepted: true, success: true, startedAt: new Date().toISOString(), busy: true };
  },
  getStatus: async () => ({
    ok: true,
    busy: busyFlag,
    lastPunchCycle: finishedAt
      ? {
          success: true,
          inserted: 3,
          duplicates: 1,
          forwarded: 4,
          finishedAt,
          trigger: 'manual',
        }
      : null,
  }),
});
assert.equal(started, 'started');
assert.equal(isClockCollectActive(), true);
assert.equal(getClockCollectState().phase, 'running');

// Second start while running → busy
const again = await startClockCollect({
  scope: 'punches',
  trigger: async () => ({ accepted: true }),
  getStatus: async () => ({ ok: true, busy: true }),
});
assert.equal(again, 'busy');

// Complete cycle
busyFlag = false;
finishedAt = new Date(Date.now() + 1000).toISOString();
// Poll interval is 4s; wait up to 6s for success.
await new Promise((r) => setTimeout(r, 4500));
assert.equal(getClockCollectState().phase, 'success', JSON.stringify(getClockCollectState()));
assert.match(getClockCollectState().summary || '', /ok:3/);
acknowledgeClockCollectResult();
assert.equal(getClockCollectState().phase, 'idle');

console.log('test-clock-collect-async: ok');
