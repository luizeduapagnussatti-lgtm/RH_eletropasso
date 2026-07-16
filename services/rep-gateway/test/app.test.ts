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

function testDependencies(overrides: Record<string, string> = {}) {
  const quarantine = new MemoryQuarantine();
  const config = loadConfig({
    NODE_ENV: 'test',
    REP_ALLOWED_IPS: '127.0.0.1',
    REP_CAPTURE_DIR: 'memory',
    REP_SECURITY_MODE: 'discovery',
    REP_FORWARD_ENABLED: 'false',
    REP_ACK_BODY: 'ACK',
    ...overrides,
  });
  return {
    quarantine,
    config,
    logger: pino({ level: 'silent' }),
  };
}

describe('REP gateway', () => {
  it('captures raw bytes on root and unknown POST routes', async () => {
    const dependencies = testDependencies();
    const app = createApp(dependencies);
    const payload = Buffer.from([0, 255, 10, 13, 65]);

    const root = await request(app)
      .post('/')
      .set('content-type', 'application/octet-stream')
      .send(payload);
    const nested = await request(app)
      .post('/firmware/unknown/path?device=1')
      .set('content-type', 'application/octet-stream')
      .send(payload);

    assert.equal(root.status, 200);
    assert.equal(root.text, 'ACK');
    assert.equal(nested.status, 200);
    assert.equal(dependencies.quarantine.captures.length, 2);
    assert.deepEqual(dependencies.quarantine.captures[0]?.body, payload);
    assert.equal(
      dependencies.quarantine.captures[1]?.capture.url,
      '/firmware/unknown/path?device=1',
    );
    assert.equal(
      dependencies.quarantine.captures[0]?.capture.security.status,
      'not-attempted',
    );
  });

  it('redacts sensitive headers from capture metadata', async () => {
    const dependencies = testDependencies();
    const app = createApp(dependencies);

    await request(app)
      .post('/push')
      .set('authorization', 'Bearer secret')
      .set('cookie', 'session=secret')
      .send('payload');

    const headers = dependencies.quarantine.captures[0]?.capture.headers;
    assert.equal(headers?.authorization, '[REDACTED]');
    assert.equal(headers?.cookie, '[REDACTED]');
  });

  it('rejects an unauthorized source before capture', async () => {
    const dependencies = testDependencies({ REP_ALLOWED_IPS: '192.168.15.201' });
    const app = createApp(dependencies);

    const response = await request(app).post('/push').send('payload');

    assert.equal(response.status, 403);
    assert.equal(dependencies.quarantine.captures.length, 0);
  });

  it('accepts a Docker NAT source only with the configured serial and redacts identifiers', async () => {
    const dependencies = testDependencies({
      REP_ALLOWED_IPS: '192.168.15.201',
      REP_NAT_IPS: '127.0.0.1',
    });
    const app = createApp(dependencies);

    const denied = await request(app)
      .post('/v1/identification?sn=wrong&identifier=111.111.111-11')
      .send('');
    const accepted = await request(app)
      .post('/v1/identification?sn=00003004820030709&identifier=111.111.111-11')
      .send('');

    assert.equal(denied.status, 403);
    assert.equal(accepted.status, 200);
    assert.equal(dependencies.quarantine.captures.length, 1);
    assert.match(
      dependencies.quarantine.captures[0]?.capture.url ?? '',
      /identifier=%5BREDACTED%5D/,
    );
    assert.doesNotMatch(
      dependencies.quarantine.captures[0]?.capture.url ?? '',
      /111/,
    );
  });

  it('enforces the configured body-size limit', async () => {
    const dependencies = testDependencies({ REP_MAX_BODY_BYTES: '4' });
    const app = createApp(dependencies);

    const response = await request(app)
      .post('/push')
      .set('content-type', 'application/octet-stream')
      .send(Buffer.from('12345'));

    assert.equal(response.status, 413);
    assert.equal(dependencies.quarantine.captures.length, 0);
  });

  it('exposes a health endpoint without accepting other methods', async () => {
    const dependencies = testDependencies();
    const app = createApp(dependencies);

    assert.equal((await request(app).get('/health')).status, 200);
    assert.equal((await request(app).get('/anything')).status, 405);
  });
});
