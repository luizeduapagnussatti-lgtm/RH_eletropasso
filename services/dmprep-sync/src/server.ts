import pino from 'pino';
import { loadConfig } from './config.js';
import { startHttpServer } from './http/server.js';
import { startSyncLoop } from './sync.js';

const config = loadConfig();
const logger = pino({
  level: config.logLevel,
  base: { service: 'dmprep-sync' },
});

logger.info(
  {
    movimentPath: config.movimentPath,
    movimentEnabled: config.movimentEnabled,
    mdbPath: config.mdbPath,
    deviceSerial: config.deviceSerial,
    pollIntervalMs: config.pollIntervalMs,
    statePath: config.statePath,
    watchcomm: config.watchcomm,
    httpPort: config.http.enabled ? config.http.port : null,
  },
  'DMPREP sync starting',
);

const loop = config.movimentEnabled ? startSyncLoop(config, logger) : null;
if (!config.movimentEnabled) {
  logger.info('MOVIMENT.txt auto-poll disabled — punches via WatchComm TCP (Task Scheduler + manual sync)');
}
const http = startHttpServer(config, logger);

function shutdown(signal: string) {
  logger.info({ signal }, 'DMPREP sync shutting down');
  loop?.stop();
  void http.close().finally(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
