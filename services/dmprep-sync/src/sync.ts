import pino from 'pino';
import type { SyncConfig } from './config.js';
import { forwardPunches, toIngestPunch } from './ingest/client.js';
import { parseMovimentFile } from './moviment.js';
import { loadSyncState, saveSyncState, type SyncState } from './state.js';

import { withSyncLock } from './syncLock.js';

export interface SyncRunResult {
  scannedLines: number;
  newRecords: number;
  inserted: number;
  duplicates: number;
  skippedPunches: number;
  skippedEmployeeIds: string[];
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
      skippedPunches: 0,
      skippedEmployeeIds: [],
      skipped: true,
      resetCursor: truncated,
    };
  }

  let inserted = 0;
  let duplicates = 0;
  let skippedPunches = 0;
  const skippedEmployeeIds = new Set<string>();

  for (let offset = 0; offset < records.length; offset += config.batchSize) {
    const batch = records.slice(offset, offset + config.batchSize);
    const punches = batch.map((record) => toIngestPunch(record, config.deviceSerial));
    const result = await deps.forward(punches, config.ingest, config.deviceSerial);
    inserted += result.inserted;
    duplicates += result.duplicates;
    skippedPunches += result.skipped;
    for (const employeeId of result.skippedEmployeeIds) {
      skippedEmployeeIds.add(employeeId);
    }
    logger.info(
      {
        batchSize: batch.length,
        inserted: result.inserted,
        duplicates: result.duplicates,
        skipped: result.skipped,
        skippedEmployeeIds: result.skippedEmployeeIds,
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
    skippedPunches,
    skippedEmployeeIds: [...skippedEmployeeIds],
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

  const tick = async () => {
    if (stopped) return;
    const result = await withSyncLock(async () => {
      try {
        const syncResult = await runSyncOnce(config, logger, deps);
        if (!syncResult.skipped) {
          logger.info(syncResult, 'DMPREP sync completed');
        }
        return syncResult;
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
        return undefined;
      }
    });
    if (result && 'busy' in result && result.busy) return;
  };

  const safeTick = () => {
    void tick().catch((error) => {
      logger.error({ err: error }, 'DMPREP sync tick failed unexpectedly');
    });
  };

  safeTick();
  const timer = setInterval(safeTick, config.pollIntervalMs);

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
