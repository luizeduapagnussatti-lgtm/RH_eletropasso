import pino, { type Logger } from 'pino';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function createLogger(level = 'info', logFile?: string): Logger {
  const options = {
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        '*.password',
        '*.senha',
        '*.cpf',
        'apiKey',
      ],
      censor: '[REDACTED]',
    },
    base: { service: 'rep-gateway' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  if (!logFile) return pino(options);

  mkdirSync(path.dirname(logFile), { recursive: true });
  return pino(
    options,
    pino.multistream([
      { stream: process.stdout },
      { stream: pino.destination({ dest: logFile, mkdir: true, sync: false }) },
    ]),
  );
}
