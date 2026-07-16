import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { forwardPunches } from '../src/ingest/client.js';

describe('Supabase forwarding', () => {
  it('fails closed when ingest-punches is unavailable', async () => {
    await assert.rejects(
      forwardPunches(
        [
          {
            employeeId: 'MAT001',
            punchedAt: '2026-07-16T08:00:00-03:00',
            direction: 'IN',
            deviceId: 'REP-01',
            nsr: '54406',
            raw: {},
          },
        ],
        {
          enabled: true,
          url: 'http://127.0.0.1:1/functions/v1/ingest-punches',
          apiKey: 'test-key-at-least-sixteen-characters',
          organizationId: '7e620d63-0d21-4307-9f4e-1f1fa96cbc74',
          timeoutMs: 100,
        },
      ),
    );
  });
});
