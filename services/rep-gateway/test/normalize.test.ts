import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { normalizeCapture } from '../src/protocol/normalize.js';
import type { CapturedRequest } from '../src/types.js';

const validCapture: CapturedRequest = {
  id: 'capture-1',
  receivedAt: '2026-07-16T12:00:00.000Z',
  method: 'POST',
  url: '/push',
  sourceIp: '192.168.15.201',
  headers: {},
  contentType: 'application/json',
  bodyBytes: 1,
  bodySha256: 'abc123',
  bodyBase64: '',
  bodyUtf8Preview: null,
  deviceSerial: '00003004820030709',
  security: { status: 'valid', algorithm: 'test' },
};

describe('protocol normalization', () => {
  it('never promotes discovery captures', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      REP_PROTOCOL_PROFILE: 'discovery',
      REP_FORWARD_ENABLED: 'false',
    });
    const body = Buffer.from(
      JSON.stringify({
        employeeId: 'MAT001',
        punchedAt: '2026-07-16T08:00:00-03:00',
      }),
    );
    assert.deepEqual(normalizeCapture(validCapture, body, config), []);
  });

  it('normalizes an explicitly selected JSON profile and derives idempotency', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      REP_PROTOCOL_PROFILE: 'generic-json-v1',
      REP_FORWARD_ENABLED: 'false',
    });
    const body = Buffer.from(
      JSON.stringify({
        employeeId: 'MAT001',
        punchedAt: '2026-07-16T08:00:00-03:00',
        direction: 'IN',
        serial: '00003004820030709',
      }),
    );
    const [punch] = normalizeCapture(validCapture, body, config);
    assert.equal(punch?.employeeId, 'MAT001');
    assert.equal(punch?.deviceId, '00003004820030709');
    assert.equal(punch?.nsr, 'sha256:abc123');
  });
});
