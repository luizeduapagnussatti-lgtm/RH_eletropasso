import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { QuarantineStore } from '../src/storage/quarantine.js';
import type { CapturedRequest } from '../src/types.js';

class MemoryQuarantine implements QuarantineStore {
  captures: Array<{ capture: CapturedRequest; body: Buffer }> = [];

  async save(capture: CapturedRequest, body: Buffer) {
    this.captures.push({ capture, body: Buffer.from(body) });
    return { metadataPath: 'memory.json', bodyPath: 'memory.bin' };
  }
}

const ACTIVE_PRINTPOINT_MODULUS =
  '916CA83A303938982FC68C1B158E3DB9E34C2CA294F35251154E9B87BF69F1E82E3E0225CFFBB9632609444DA7977A3633471B536395BBE3533506300E10544EBDCFC33FB484FE4B94FD727FA0E857B1B82EE811D6BE84AEB3B1B66DAA85DB329F5E5E74E9D8EA9F929AE781FBF16430D12229B533BEE3921358F4139E4ADBBF';

describe('WatchComm RSA handshake mode', () => {
  it('returns the encrypted ACK bytes from the injected WatchComm encryptor', async () => {
    const quarantine = new MemoryQuarantine();
    const config = loadConfig({
      NODE_ENV: 'test',
      REP_ALLOWED_IPS: '127.0.0.1',
      REP_CAPTURE_DIR: 'memory',
      REP_SECURITY_MODE: 'discovery',
      REP_FORWARD_ENABLED: 'false',
      REP_ACK_MODE: 'watchcomm-rsa',
      REP_ACK_WATCHCOMM_PROBES: 'status-inquiry,empty',
      REP_RSA_MODULUS_HEX: ACTIVE_PRINTPOINT_MODULUS,
    });
    const app = createApp({
      quarantine,
      config,
      logger: pino({ level: 'silent' }),
      encryptWatchCommAck: async ({ probe }) =>
        Buffer.from(`watchcomm:${probe}`, 'utf8'),
    });

    const first = await request(app).post('/v1/identification').send('');
    const second = await request(app).post('/v1/identification').send('');

    assert.equal(first.status, 200);
    assert.equal(first.text, 'watchcomm:status-inquiry');
    assert.equal(second.text, 'watchcomm:empty');
  });
});
