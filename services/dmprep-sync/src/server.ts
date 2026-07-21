import pino from 'pino';
import { loadConfig } from './config.js';
import { startSyncLoop } from './sync.js';

const config = loadConfig();
const logger = pino({
  level: config.logLevel,
  base: { service: 'dmprep-sync' },
});

logger.info(
  {
    movimentPath: config.movimentPath,
    deviceSerial: config.deviceSerial,
    pollIntervalMs: config.pollIntervalMs,
    statePath: config.statePath,
  },
  'DMPREP sync starting',
);

const loop = startSyncLoop(config, logger);

function shutdown(signal: string) {
  logger.info({ signal }, 'DMPREP sync shutting down');
  loop.stop();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
