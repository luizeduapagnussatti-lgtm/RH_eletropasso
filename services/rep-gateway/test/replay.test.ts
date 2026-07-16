import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ReplayGuard } from '../src/security/replay.js';
import type { NormalizedPunch } from '../src/types.js';

const punch: NormalizedPunch = {
  employeeId: 'MAT001',
  punchedAt: '2026-07-16T08:00:00-03:00',
  direction: 'IN',
  deviceId: 'REP-01',
  nsr: '54406',
  raw: {},
};

describe('replay protection', () => {
  it('rejects duplicate device/NSR inside the TTL', () => {
    const guard = new ReplayGuard(60_000, 100);
    assert.equal(guard.accept([punch], 1_000), true);
    assert.equal(guard.accept([punch], 2_000), false);
    assert.equal(guard.accept([punch], 61_001), true);
  });

  it('rejects duplicates within one batch', () => {
    const guard = new ReplayGuard(60_000, 100);
    assert.equal(guard.accept([punch, { ...punch }], 1_000), false);
  });
});
