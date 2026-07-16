import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  REP_LOG_FILE: z.string().optional(),
  REP_ALLOWED_IPS: z.string().default('192.168.15.201'),
  REP_NAT_IPS: z.string().default(''),
  REP_DEVICE_SERIAL: z.string().default('00003004820030709'),
  REP_CAPTURE_DIR: z.string().default('/data/captures'),
  REP_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  REP_MAX_CAPTURE_FILES: z.coerce.number().int().min(100).max(1_000_000).default(10_000),
  REP_MAX_BODY_BYTES: z.coerce.number().int().positive().max(10_000_000).default(1_048_576),
  REP_ACK_STATUS: z.coerce.number().int().min(200).max(599).default(200),
  REP_ACK_CONTENT_TYPE: z.string().default('text/plain; charset=utf-8'),
  REP_ACK_BODY: z.string().default('OK'),
  REP_ACK_MODE: z.enum(['plain', 'rsa-pkcs1-probe']).default('plain'),
  REP_ACK_RSA_PLAINTEXT_HEX: z.string().regex(/^(?:[0-9a-fA-F]{2})*$/).default(''),
  REP_ACK_RSA_PROBE_HEX_CANDIDATES: z.string().default('empty'),
  REP_SECURITY_MODE: z.enum(['discovery', 'verify']).default('discovery'),
  REP_RSA_MODULUS_HEX: z.string().regex(/^[0-9a-fA-F]+$/).optional(),
  REP_RSA_EXPONENT_HEX: z.string().regex(/^[0-9a-fA-F]+$/).default('010001'),
  REP_SIGNATURE_HEADER: z.string().default('x-signature'),
  REP_SIGNATURE_ENCODING: z.enum(['base64', 'base64url', 'hex']).default('base64'),
  REP_RSA_HASH: z.enum(['sha1', 'sha256', 'sha384', 'sha512']).default('sha256'),
  REP_RSA_PADDING: z.enum(['pkcs1', 'pss']).default('pkcs1'),
  REP_RSA_PSS_SALT_LENGTH: z.coerce.number().int().min(-2).default(-1),
  REP_PROTOCOL_PROFILE: z.enum(['discovery', 'generic-json-v1']).default('discovery'),
  REP_FORWARD_ENABLED: booleanFromString,
  PUNCH_INGEST_URL: z.string().url().optional(),
  PUNCH_INGEST_API_KEY: z.string().min(16).optional(),
  PUNCH_INGEST_ORGANIZATION_ID: z.string().uuid().optional(),
  PUNCH_INGEST_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(5_000),
  REP_REPLAY_TTL_SECONDS: z.coerce.number().int().min(60).max(604_800).default(172_800),
  REP_REPLAY_MAX_ENTRIES: z.coerce.number().int().min(100).max(1_000_000).default(10_000),
});

export type GatewayConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: string;
  logFile?: string;
  allowedIps: Set<string>;
  natIps: Set<string>;
  deviceSerial: string;
  captureDir: string;
  retentionDays: number;
  maxCaptureFiles: number;
  maxBodyBytes: number;
  ack: {
    status: number;
    contentType: string;
    body: string;
    mode: 'plain' | 'rsa-pkcs1-probe';
    rsaPlaintextHex: string;
    rsaProbeHexCandidates: string[];
  };
  security: {
    mode: 'discovery' | 'verify';
    modulusHex?: string;
    exponentHex: string;
    signatureHeader: string;
    signatureEncoding: BufferEncoding | 'base64url';
    hash: 'sha1' | 'sha256' | 'sha384' | 'sha512';
    padding: 'pkcs1' | 'pss';
    pssSaltLength: number;
  };
  protocolProfile: 'discovery' | 'generic-json-v1';
  replay: { ttlMs: number; maxEntries: number };
  forward: {
    enabled: boolean;
    url?: string;
    apiKey?: string;
    organizationId?: string;
    timeoutMs: number;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const parsed = configSchema.parse(env);
  const allowedIps = new Set(
    parsed.REP_ALLOWED_IPS.split(',')
      .map((ip) => normalizeIp(ip.trim()))
      .filter(Boolean),
  );
  const natIps = new Set(
    parsed.REP_NAT_IPS.split(',')
      .map((ip) => normalizeIp(ip.trim()))
      .filter(Boolean),
  );

  if (parsed.REP_SECURITY_MODE === 'verify' && !parsed.REP_RSA_MODULUS_HEX) {
    throw new Error('REP_RSA_MODULUS_HEX is required in verify mode');
  }
  if (
    parsed.REP_FORWARD_ENABLED &&
    (!parsed.PUNCH_INGEST_URL ||
      !parsed.PUNCH_INGEST_API_KEY ||
      !parsed.PUNCH_INGEST_ORGANIZATION_ID)
  ) {
    throw new Error(
      'PUNCH_INGEST_URL, PUNCH_INGEST_API_KEY and PUNCH_INGEST_ORGANIZATION_ID are required when forwarding is enabled',
    );
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    logFile: parsed.REP_LOG_FILE,
    allowedIps,
    natIps,
    deviceSerial: parsed.REP_DEVICE_SERIAL,
    captureDir: parsed.REP_CAPTURE_DIR,
    retentionDays: parsed.REP_RETENTION_DAYS,
    maxCaptureFiles: parsed.REP_MAX_CAPTURE_FILES,
    maxBodyBytes: parsed.REP_MAX_BODY_BYTES,
    ack: {
      status: parsed.REP_ACK_STATUS,
      contentType: parsed.REP_ACK_CONTENT_TYPE,
      body: parsed.REP_ACK_BODY,
      mode: parsed.REP_ACK_MODE,
      rsaPlaintextHex: parsed.REP_ACK_RSA_PLAINTEXT_HEX,
      rsaProbeHexCandidates: parsed.REP_ACK_RSA_PROBE_HEX_CANDIDATES.split(',')
        .map((candidate) => candidate.trim())
        .map((candidate) => (candidate === 'empty' ? '' : candidate))
        .filter((candidate) => /^(?:[0-9a-fA-F]{2})*$/.test(candidate)),
    },
    security: {
      mode: parsed.REP_SECURITY_MODE,
      modulusHex: parsed.REP_RSA_MODULUS_HEX,
      exponentHex: parsed.REP_RSA_EXPONENT_HEX,
      signatureHeader: parsed.REP_SIGNATURE_HEADER.toLowerCase(),
      signatureEncoding: parsed.REP_SIGNATURE_ENCODING,
      hash: parsed.REP_RSA_HASH,
      padding: parsed.REP_RSA_PADDING,
      pssSaltLength: parsed.REP_RSA_PSS_SALT_LENGTH,
    },
    protocolProfile: parsed.REP_PROTOCOL_PROFILE,
    replay: {
      ttlMs: parsed.REP_REPLAY_TTL_SECONDS * 1_000,
      maxEntries: parsed.REP_REPLAY_MAX_ENTRIES,
    },
    forward: {
      enabled: parsed.REP_FORWARD_ENABLED,
      url: parsed.PUNCH_INGEST_URL,
      apiKey: parsed.PUNCH_INGEST_API_KEY,
      organizationId: parsed.PUNCH_INGEST_ORGANIZATION_ID,
      timeoutMs: parsed.PUNCH_INGEST_TIMEOUT_MS,
    },
  };
}

export function normalizeIp(ip: string): string {
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}
