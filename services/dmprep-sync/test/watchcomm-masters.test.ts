import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScope } from '../src/http/server.js';
import { runWatchCommMasters, type WatchCommMaster } from '../src/watchcomm/sendMasters.js';
import type { SyncConfig } from '../src/config.js';

const master: WatchCommMaster = {
  code: '12345',
  pis: '123456789012',
  password: '123456',
  hasTechnicalPermission: true,
  hasDatetimePermission: true,
  hasPendrivePermission: true,
  hasBobbinPermission: false,
};

const config = {} as SyncConfig;

describe('WatchComm master commands', () => {
  it('parses send and clear scopes without dropping master payload', () => {
    const send = parseScope(JSON.stringify({ scope: 'send-masters', masters: [master] }));
    assert.equal(send.scope, 'send-masters');
    assert.deepEqual(send.masters, [master]);
    assert.equal(parseScope('{"scope":"clear-masters"}').scope, 'clear-masters');
  });

  it('rejects unknown scopes instead of falling open to all', () => {
    assert.throws(
      () => parseScope(JSON.stringify({ scope: 'export-employees-typo' })),
      /Invalid sync scope/,
    );
    assert.throws(
      () => parseScope('{not-json'),
      /Invalid sync scope/,
    );
  });

  it('rejects an empty send list before spawning PowerShell', async () => {
    await assert.rejects(
      runWatchCommMasters(config, 'send', []),
      /between 1 and 5/,
    );
  });

  it('rejects more than five masters before spawning PowerShell', async () => {
    await assert.rejects(
      runWatchCommMasters(config, 'send', Array.from({ length: 6 }, () => master)),
      /between 1 and 5/,
    );
  });
});
