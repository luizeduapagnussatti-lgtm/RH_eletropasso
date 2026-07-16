import { createHash, randomUUID } from 'node:crypto';
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from 'express';
import type { Logger } from 'pino';
import type { GatewayConfig } from './config.js';
import { normalizeIp } from './config.js';
import { forwardPunches } from './ingest/client.js';
import { normalizeCapture } from './protocol/normalize.js';
import { ReplayGuard } from './security/replay.js';
import { encryptRsaProbe, evaluateRequestSignature } from './security/rsa.js';
import type { QuarantineStore } from './storage/quarantine.js';
import type { CapturedRequest, SanitizedHeaders } from './types.js';

export interface AppDependencies {
  config: GatewayConfig;
  logger: Logger;
  quarantine: QuarantineStore;
  forward?: typeof forwardPunches;
}

export function createApp(dependencies: AppDependencies) {
  const { config, logger, quarantine } = dependencies;
  const app = express();
  const replayGuard = new ReplayGuard(
    config.replay.ttlMs,
    config.replay.maxEntries,
  );
  const metrics = {
    startedAt: new Date().toISOString(),
    accepted: 0,
    denied: 0,
    captureFailures: 0,
    signatureRejected: 0,
    normalized: 0,
    replayRejected: 0,
    forwarded: 0,
    processingFailures: 0,
  };
  let rsaProbeIndex = 0;
  let lastRsaProbe: { index: number; plaintextHex: string } | null = null;
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      mode: config.security.mode,
      protocolProfile: config.protocolProfile,
      deviceSerial: config.deviceSerial,
      forwarding: config.forward.enabled,
      now: new Date().toISOString(),
    });
  });
  app.get('/metrics', (_req, res) => {
    res.status(200).json(metrics);
  });

  const rawParser = express.raw({
    type: () => true,
    limit: config.maxBodyBytes,
    inflate: false,
  });

  app.post('/{*splat}', rawParser, async (req: Request, res: Response) => {
    const sourceIp = normalizeIp(req.socket.remoteAddress ?? req.ip ?? '');
    const safeUrl = sanitizeUrl(req.originalUrl);
    if (!isAllowedSource(req, sourceIp, config)) {
      metrics.denied++;
      logger.warn({ sourceIp, method: req.method, url: safeUrl }, 'REP request denied');
      res.status(403).type('text/plain').send('Forbidden');
      return;
    }

    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    metrics.accepted++;
    const bodySha256 = createHash('sha256').update(body).digest('hex');
    const security = evaluateRequestSignature(body, req.headers, config.security);
    const capture: CapturedRequest = {
      id: randomUUID(),
      receivedAt: new Date().toISOString(),
      method: req.method,
      url: safeUrl,
      sourceIp,
      headers: sanitizeHeaders(req.headers),
      contentType: req.get('content-type') ?? null,
      bodyBytes: body.length,
      bodySha256,
      bodyBase64: body.toString('base64'),
      bodyUtf8Preview: safeUtf8Preview(body),
      deviceSerial: config.deviceSerial,
      security,
    };

    try {
      const paths = await quarantine.save(capture, body);
      logger.info(
        {
          captureId: capture.id,
          sourceIp,
          method: capture.method,
          url: capture.url,
          contentType: capture.contentType,
          bodyBytes: capture.bodyBytes,
          bodySha256,
          security: capture.security.status,
          metadataPath: paths.metadataPath,
        },
        'REP request captured',
      );
    } catch (error) {
      metrics.captureFailures++;
      logger.error({ err: error, captureId: capture.id }, 'Failed to persist REP capture');
      res.status(503).type('text/plain').send('Capture unavailable');
      return;
    }

    if (req.path === '/v1/confirmcommand' && lastRsaProbe) {
      logger.info(
        {
          probeIndex: lastRsaProbe.index,
          plaintextHex: lastRsaProbe.plaintextHex || 'empty',
          command: firstQueryValue(req.query.command),
          deviceError: firstQueryValue(req.query.error),
        },
        'REP RSA probe result',
      );
    }

    if (config.security.mode === 'verify' && security.status !== 'valid') {
      metrics.signatureRejected++;
      logger.warn(
        { captureId: capture.id, reason: security.reason },
        'REP signature rejected',
      );
      res.status(401).type('text/plain').send('Invalid signature');
      return;
    }

    // ACK before downstream work: the REP must not retry because Supabase is slow.
    try {
      let probe: { index: number; plaintextHex: string } | null = null;
      if (config.ack.mode === 'rsa-pkcs1-probe' && req.path === '/v1/identification') {
        const candidates =
          config.ack.rsaProbeHexCandidates.length > 0
            ? config.ack.rsaProbeHexCandidates
            : [config.ack.rsaPlaintextHex];
        const index = rsaProbeIndex % candidates.length;
        probe = { index, plaintextHex: candidates[index] ?? '' };
        rsaProbeIndex++;
        lastRsaProbe = probe;
      }
      const ackBody = buildAckBody(req.path, config, probe?.plaintextHex);
      res.status(config.ack.status).type(config.ack.contentType).send(ackBody);
      if (probe) {
        logger.info(
          {
            probeIndex: probe.index,
            plaintextHex: probe.plaintextHex || 'empty',
            cipherBytes: Buffer.isBuffer(ackBody) ? ackBody.length : 0,
          },
          'REP RSA probe sent',
        );
      }
    } catch (error) {
      logger.error({ err: error, captureId: capture.id }, 'Failed to build REP ACK');
      res.status(500).type('text/plain').send('ACK unavailable');
      return;
    }

    void processCapture(capture, body, dependencies, replayGuard, metrics).catch((error) => {
      metrics.processingFailures++;
      logger.error({ err: error, captureId: capture.id }, 'Post-ACK processing failed');
    });
  });

  app.use((req, res) => {
    res.status(405).json({ error: 'Only POST catch-all and GET /health are supported' });
  });

  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    const tooLarge =
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large';
    logger.warn(
      {
        err: error,
        sourceIp: normalizeIp(req.socket.remoteAddress ?? ''),
        url: req.originalUrl,
      },
      tooLarge ? 'REP payload too large' : 'REP request parsing failed',
    );
    res.status(tooLarge ? 413 : 400).type('text/plain').send(tooLarge ? 'Payload too large' : 'Bad request');
  };
  app.use(errorHandler);

  return app;
}

async function processCapture(
  capture: CapturedRequest,
  body: Buffer,
  dependencies: AppDependencies,
  replayGuard: ReplayGuard,
  metrics: {
    normalized: number;
    replayRejected: number;
    forwarded: number;
  },
): Promise<void> {
  const punches = normalizeCapture(capture, body, dependencies.config);
  if (punches.length === 0) return;
  metrics.normalized += punches.length;
  if (!replayGuard.accept(punches)) {
    metrics.replayRejected += punches.length;
    dependencies.logger.warn(
      { captureId: capture.id, punches: punches.length },
      'REP replay rejected before forwarding',
    );
    return;
  }
  if (!dependencies.config.forward.enabled) {
    dependencies.logger.warn(
      { captureId: capture.id, punches: punches.length },
      'Normalized punches not forwarded because forwarding is disabled',
    );
    return;
  }

  const forward = dependencies.forward ?? forwardPunches;
  const result = await forward(punches, dependencies.config.forward);
  metrics.forwarded += punches.length;
  dependencies.logger.info(
    { captureId: capture.id, result },
    'Validated REP punches forwarded',
  );
}

function isAllowedSource(
  req: Request,
  sourceIp: string,
  config: GatewayConfig,
): boolean {
  if (config.allowedIps.has('*') || config.allowedIps.has(sourceIp)) return true;
  if (!config.natIps.has(sourceIp)) return false;

  // Docker Desktop hides the LAN source behind its bridge address. In that
  // constrained case, require the device serial embedded by this firmware.
  // Windows Firewall remains responsible for the real source-IP restriction.
  const serial = firstQueryValue(req.query.sn);
  return serial === config.deviceSerial;
}

function sanitizeHeaders(headers: Request['headers']): SanitizedHeaders {
  const blocked = new Set([
    'authorization',
    'cookie',
    'proxy-authorization',
    'x-api-key',
    'x-ingest-key',
  ]);
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      blocked.has(key.toLowerCase()) ? '[REDACTED]' : value,
    ]),
  );
}

function safeUtf8Preview(body: Buffer): string | null {
  if (body.length === 0) return '';
  const preview = body.subarray(0, 2_048).toString('utf8');
  const replacementCount = [...preview].filter((char) => char === '\uFFFD').length;
  if (replacementCount > Math.max(2, preview.length * 0.01)) return null;
  return preview.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_REDACTED]');
}

function sanitizeUrl(originalUrl: string): string {
  const url = new URL(originalUrl, 'http://rep.local');
  const sensitiveParams = ['identifier', 'cpf', 'password', 'senha', 'token', 'key'];
  for (const name of sensitiveParams) {
    if (url.searchParams.has(name)) url.searchParams.set(name, '[REDACTED]');
  }
  return `${url.pathname}${url.search}`;
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function buildAckBody(
  pathname: string,
  config: GatewayConfig,
  probePlaintextHex?: string,
): string | Buffer {
  if (config.ack.mode === 'plain' || pathname !== '/v1/identification') {
    return config.ack.body;
  }
  if (!config.security.modulusHex) {
    throw new Error('RSA modulus is required for encrypted ACK probe');
  }
  return encryptRsaProbe(
    Buffer.from(probePlaintextHex ?? config.ack.rsaPlaintextHex, 'hex'),
    config.security.modulusHex,
    config.security.exponentHex,
  );
}
