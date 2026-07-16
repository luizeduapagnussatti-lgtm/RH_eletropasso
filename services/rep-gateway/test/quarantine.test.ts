import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { FileQuarantineStore } from '../src/storage/quarantine.js';
import type { CapturedRequest } from '../src/types.js';

function capture(id: string, receivedAt: string): CapturedRequest {
  return {
    id,
    receivedAt,
    method: 'POST',
    url: '/test',
    sourceIp: '192.168.15.201',
    headers: {},
    contentType: 'application/octet-stream',
    bodyBytes: 3,
    bodySha256: 'abc',
    bodyBase64: 'YWJj',
    bodyUtf8Preview: 'abc',
    deviceSerial: 'REP-01',
    security: { status: 'not-attempted', reason: 'test' },
  };
}

describe('file quarantine', () => {
  it('preserves exact bytes and removes expired capture pairs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rep-quarantine-'));
    try {
      const store = new FileQuarantineStore(root, { retentionDays: 1, maxFiles: 100 });
      const saved = await store.save(capture('old', '2026-07-14T12:00:00.000Z'), Buffer.from([0, 1, 255]));
      assert.deepEqual(await readFile(saved.bodyPath), Buffer.from([0, 1, 255]));

      const oldDate = new Date('2026-07-14T12:00:00.000Z');
      await utimes(saved.metadataPath, oldDate, oldDate);
      await store.cleanup(new Date('2026-07-16T12:00:00.000Z').getTime());

      await assert.rejects(readFile(saved.metadataPath));
      await assert.rejects(readFile(saved.bodyPath));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
