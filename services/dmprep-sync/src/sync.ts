import pino from 'pino';
import type { SyncConfig } from './config.js';
import { forwardPunches, toIngestPunch } from './ingest/client.js';
import { parseMovimentFile } from './moviment.js';
import { loadSyncState, saveSyncState, type SyncState } from './state.js';

export interface SyncRunResult {
  scannedLines: number;
  newRecords: number;
  inserted: number;
  duplicates: number;
  skipped: boolean;
  resetCursor: boolean;
}

export interface SyncDependencies {
  readMoviment: (path: string) => Promise<{ content: string; size: number; mtimeMs: number }>;
  forward: typeof forwardPunches;
  now?: () => Date;
}

const defaultDependencies: SyncDependencies = {
  readMoviment: async (movimentPath) => {
    const { readFile, stat } = await import('node:fs/promises');
    const [content, stats] = await Promise.all([
      readFile(movimentPath, 'utf8'),
      stat(movimentPath),
    ]);
    return { content, size: stats.size, mtimeMs: stats.mtimeMs };
  },
  forward: forwardPunches,
};

export async function runSyncOnce(
  config: SyncConfig,
  logger: pino.Logger,
  deps: SyncDependencies = defaultDependencies,
): Promise<SyncRunResult> {
  const state = await loadSyncState(config.statePath);
  const file = await deps.readMoviment(config.movimentPath);

  const truncated = file.size < state.fileSize || file.mtimeMs < state.lastModifiedMs;
  const startRecords = truncated ? 0 : state.recordCount;
  const { records, totalRecords } = parseMovimentFile(
    file.content,
    config.deviceSerial,
    startRecords,
  );

  if (records.length === 0 && file.size === state.fileSize && file.mtimeMs === state.lastModifiedMs) {
    return {
      scannedLines: totalRecords,
      newRecords: 0,
      inserted: 0,
      duplicates: 0,
      skipped: true,
      resetCursor: truncated,
    };
  }

  let inserted = 0;
  let duplicates = 0;

  for (let offset = 0; offset < records.length; offset += config.batchSize) {
    const batch = records.slice(offset, offset + config.batchSize);
    const punches = batch.map((record) => toIngestPunch(record, config.deviceSerial));
    const result = await deps.forward(punches, config.ingest, config.deviceSerial);
    inserted += result.inserted;
    duplicates += result.duplicates;
    logger.info(
      {
        batchSize: batch.length,
        inserted: result.inserted,
        duplicates: result.duplicates,
        affectedDates: result.affectedDates,
      },
      'DMPREP batch forwarded',
    );
  }

  const nextState: SyncState = {
    recordCount: totalRecords,
    fileSize: file.size,
    lastModifiedMs: file.mtimeMs,
    lastSyncAt: (deps.now ?? (() => new Date()))().toISOString(),
  };
  await saveSyncState(config.statePath, nextState);

  if (truncated) {
    logger.warn(
      { previous: state, next: nextState },
      'MOVIMENT.txt shrank or was rotated; cursor reset',
    );
  }

  return {
    scannedLines: totalRecords,
    newRecords: records.length,
    inserted,
    duplicates,
    skipped: false,
    resetCursor: truncated,
  };
}

export function startSyncLoop(
  config: SyncConfig,
  logger: pino.Logger,
  deps: SyncDependencies = defaultDependencies,
): { stop: () => void } {
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const result = await runSyncOnce(config, logger, deps);
      if (!result.skipped) {
        logger.info(result, 'DMPREP sync completed');
      }
    } catch (error) {
      logger.error({ err: error }, 'DMPREP sync failed');
      try {
        const state = await loadSyncState(config.statePath);
        await saveSyncState(config.statePath, {
          ...state,
          lastError: error instanceof Error ? error.message : String(error),
          lastSyncAt: new Date().toISOString(),
        });
      } catch (stateError) {
        logger.error({ err: stateError }, 'Failed to persist DMPREP sync error state');
      }
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, config.pollIntervalMs);

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
