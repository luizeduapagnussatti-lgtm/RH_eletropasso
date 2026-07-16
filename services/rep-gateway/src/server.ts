import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createRsaPublicKey } from './security/rsa.js';
import { FileQuarantineStore } from './storage/quarantine.js';

const config = loadConfig();
const logger = createLogger(config.logLevel, config.logFile);

if (config.security.modulusHex) {
  const key = createRsaPublicKey(
    config.security.modulusHex,
    config.security.exponentHex,
  );
  const details = key.asymmetricKeyDetails;
  logger.info(
    {
      modulusBits: details?.modulusLength,
      exponent: details?.publicExponent?.toString(),
      securityMode: config.security.mode,
    },
    'REP RSA public key loaded',
  );
  if ((details?.modulusLength ?? 0) < 2_048) {
    logger.warn(
      { modulusBits: details?.modulusLength },
      'Legacy REP RSA key is below modern 2048-bit guidance; compensate with LAN/IP allowlisting',
    );
  }
}

const app = createApp({
  config,
  logger,
  quarantine: new FileQuarantineStore(config.captureDir, {
    retentionDays: config.retentionDays,
    maxFiles: config.maxCaptureFiles,
  }),
});

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(
    {
      port: config.port,
      allowedIps: [...config.allowedIps],
      captureDir: config.captureDir,
      securityMode: config.security.mode,
      forwarding: config.forward.enabled,
    },
    'REP gateway listening',
  );
});

function shutdown(signal: string) {
  logger.info({ signal }, 'REP gateway shutting down');
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'REP gateway shutdown failed');
      process.exitCode = 1;
    }
    process.exit();
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
