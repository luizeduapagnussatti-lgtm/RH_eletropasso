import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DMPREP_MOVIMENT_PATH: z.string().min(1),
  DMPREP_DEVICE_SERIAL: z.string().default('00003004820030709'),
  DMPREP_POLL_INTERVAL_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(90_000),
  DMPREP_STATE_PATH: z.string().default('./data/dmprep-sync-state.json'),
  DMPREP_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(100),
  PUNCH_INGEST_URL: z.string().url(),
  PUNCH_INGEST_API_KEY: z.string().min(16),
  PUNCH_INGEST_ORGANIZATION_ID: z.string().uuid(),
  PUNCH_INGEST_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(15_000),
});

export type SyncConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  movimentPath: string;
  deviceSerial: string;
  pollIntervalMs: number;
  statePath: string;
  batchSize: number;
  ingest: {
    url: string;
    apiKey: string;
    organizationId: string;
    timeoutMs: number;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const parsed = configSchema.parse(env);
  return {
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL,
    movimentPath: parsed.DMPREP_MOVIMENT_PATH,
    deviceSerial: parsed.DMPREP_DEVICE_SERIAL,
    pollIntervalMs: parsed.DMPREP_POLL_INTERVAL_MS,
    statePath: parsed.DMPREP_STATE_PATH,
    batchSize: parsed.DMPREP_BATCH_SIZE,
    ingest: {
      url: parsed.PUNCH_INGEST_URL,
      apiKey: parsed.PUNCH_INGEST_API_KEY,
      organizationId: parsed.PUNCH_INGEST_ORGANIZATION_ID,
      timeoutMs: parsed.PUNCH_INGEST_TIMEOUT_MS,
    },
  };
}
