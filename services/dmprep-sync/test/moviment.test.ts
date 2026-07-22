import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseMovimentFile, parseMovimentLine } from '../src/moviment.js';
import { runSyncOnce } from '../src/sync.js';
import type { SyncConfig } from '../src/config.js';
import pino from 'pino';

const DEVICE = '00003004820030709';

describe('MOVIMENT parser', () => {
  it('parses a 28-char DMPREP line', () => {
    const record = parseMovimentLine('0001026740847000260520260747', DEVICE);
    assert.ok(record);
    assert.equal(record.credential, '026740847000');
    assert.equal(record.punchedAt, '2026-05-26T07:47:00-03:00');
    assert.equal(record.nsr, `${DEVICE}:026740847000:260520260747`);
  });

  it('rejects malformed lines', () => {
    assert.equal(parseMovimentLine('short', DEVICE), null);
    assert.equal(parseMovimentLine('0001' + 'x'.repeat(24), DEVICE), null);
  });

  it('parses only new records from a cursor', () => {
    const content = [
      '0001026740847000260520260747',
      '0001012382373301260520260747',
    ].join('\n');
    const first = parseMovimentFile(content, DEVICE, 0);
    assert.equal(first.records.length, 2);
    assert.equal(first.totalRecords, 2);
    const second = parseMovimentFile(content, DEVICE, first.totalRecords);
    assert.equal(second.records.length, 0);
    const partial = parseMovimentFile(`${content}\n0001012491638543260520260749`, DEVICE, first.totalRecords);
    assert.equal(partial.records.length, 1);
  });
});

describe('sync loop', () => {
  it('forwards only unseen records and advances the cursor', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dmprep-sync-'));
    const forwarded: string[] = [];
    const config: SyncConfig = {
      nodeEnv: 'test',
      logLevel: 'silent',
      movimentPath: 'MOVIMENT.txt',
      mdbPath: null,
      deviceSerial: DEVICE,
      pollIntervalMs: 60_000,
      statePath: path.join(tempDir, 'state.json'),
      batchSize: 100,
      importTempPassword: 'TestImport123!',
      http: {
        enabled: false,
        host: '127.0.0.1',
        port: 3099,
        apiKey: 'x'.repeat(32),
      },
      supabase: {
        url: null,
        serviceRoleKey: null,
      },
      ingest: {
        url: 'http://example.test/ingest',
        apiKey: 'x'.repeat(32),
        organizationId: '11111111-1111-4111-8111-111111111111',
        timeoutMs: 5_000,
      },
    };

    let content = '0001026740847000260520260747\n';
    const deps = {
      readMoviment: async () => ({
        content,
        size: content.length,
        mtimeMs: Date.now(),
      }),
      forward: async (punches: Array<{ nsr: string }>) => {
        forwarded.push(...punches.map((punch) => punch.nsr));
        return {
          success: true,
          inserted: punches.length,
          duplicates: 0,
          skipped: 0,
          skippedEmployeeIds: [],
          affectedDates: [],
        };
      },
      now: () => new Date('2026-07-21T12:00:00.000Z'),
    };

    const logger = pino({ level: 'silent' });
    const first = await runSyncOnce(config, logger, deps);
    assert.equal(first.newRecords, 1);
    assert.equal(forwarded.length, 1);

    content += '0001012382373301260520260747\n';
    const second = await runSyncOnce(config, logger, {
      ...deps,
      readMoviment: async () => ({
        content,
        size: content.length,
        mtimeMs: Date.now() + 1,
      }),
    });
    assert.equal(second.newRecords, 1);
    assert.equal(forwarded.length, 2);
    await rm(tempDir, { recursive: true, force: true });
  });
});
