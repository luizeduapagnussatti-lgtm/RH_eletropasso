import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DMPREP_MOVIMENT_PATH: z.string().min(1),
  DMPREP_MDB_PATH: z.string().optional(),
  DMPREP_DEVICE_SERIAL: z.string().default('00003004820030709'),
  DMPREP_POLL_INTERVAL_MS: z.coerce.number().int().min(60_000).max(14_400_000).default(3_600_000),
  DMPREP_STATE_PATH: z.string().default('./data/dmprep-sync-state.json'),
  DMPREP_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(100),
  DMPREP_HTTP_ENABLED: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((value) => value === 'true' || value === '1'),
  DMPREP_HTTP_HOST: z.string().default('127.0.0.1'),
  DMPREP_HTTP_PORT: z.coerce.number().int().min(1024).max(65535).default(3099),
  DMPREP_HTTP_API_KEY: z.string().min(16).optional(),
  DMPREP_IMPORT_TEMP_PASSWORD: z.string().min(8).default('DmprepImport2026!'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(16).optional(),
  PUNCH_INGEST_URL: z.string().url(),
  PUNCH_INGEST_API_KEY: z.string().min(16),
  PUNCH_INGEST_ORGANIZATION_ID: z.string().uuid(),
  PUNCH_INGEST_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(15_000),
});

export type SyncConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  movimentPath: string;
  mdbPath: string | null;
  deviceSerial: string;
  pollIntervalMs: number;
  statePath: string;
  batchSize: number;
  importTempPassword: string;
  http: {
    enabled: boolean;
    host: string;
    port: number;
    apiKey: string;
  };
  supabase: {
    url: string | null;
    serviceRoleKey: string | null;
  };
  ingest: {
    url: string;
    apiKey: string;
    organizationId: string;
    timeoutMs: number;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const parsed = configSchema.parse(env);
  const httpApiKey = parsed.DMPREP_HTTP_API_KEY ?? parsed.PUNCH_INGEST_API_KEY;
  return {
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL,
    movimentPath: parsed.DMPREP_MOVIMENT_PATH,
    mdbPath: parsed.DMPREP_MDB_PATH ?? null,
    deviceSerial: parsed.DMPREP_DEVICE_SERIAL,
    pollIntervalMs: parsed.DMPREP_POLL_INTERVAL_MS,
    statePath: parsed.DMPREP_STATE_PATH,
    batchSize: parsed.DMPREP_BATCH_SIZE,
    importTempPassword: parsed.DMPREP_IMPORT_TEMP_PASSWORD,
    http: {
      enabled: parsed.DMPREP_HTTP_ENABLED,
      host: parsed.DMPREP_HTTP_HOST,
      port: parsed.DMPREP_HTTP_PORT,
      apiKey: httpApiKey,
    },
    supabase: {
      url: parsed.SUPABASE_URL ?? null,
      serviceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY ?? null,
    },
    ingest: {
      url: parsed.PUNCH_INGEST_URL,
      apiKey: parsed.PUNCH_INGEST_API_KEY,
      organizationId: parsed.PUNCH_INGEST_ORGANIZATION_ID,
      timeoutMs: parsed.PUNCH_INGEST_TIMEOUT_MS,
    },
  };
}
