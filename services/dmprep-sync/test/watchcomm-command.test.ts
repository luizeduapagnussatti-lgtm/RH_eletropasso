import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLOCK_COMMAND_ALLOWLIST,
  CLOCK_COMMAND_DENYLIST,
  isAllowedClockCommand,
  runWatchCommCommand,
} from '../src/watchcomm/command.js';
import type { SyncConfig } from '../src/config.js';

describe('WatchComm clock command allowlist', () => {
  it('accepts known read and write ops', () => {
    assert.equal(isAllowedClockCommand('status'), true);
    assert.equal(isAllowedClockCommand('send-employees'), true);
    assert.equal(isAllowedClockCommand('set-net-info'), true);
    assert.ok(CLOCK_COMMAND_ALLOWLIST.length >= 15);
  });

  it('rejects unknown and denied ops before spawning PowerShell', async () => {
    assert.equal(isAllowedClockCommand('UpdateFirmware'), false);
    assert.ok(CLOCK_COMMAND_DENYLIST.includes('UpdateFirmware'));
    await assert.rejects(
      runWatchCommCommand({} as SyncConfig, 'UpdateFirmware', {}),
      /not allowed|denied/i,
    );
    await assert.rejects(
      runWatchCommCommand({} as SyncConfig, 'not-a-real-op', {}),
      /not allowed/i,
    );
  });
});
