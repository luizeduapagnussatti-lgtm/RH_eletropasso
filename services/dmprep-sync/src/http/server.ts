import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import pino from 'pino';
import type { SyncConfig } from '../config.js';
import { importEmployeesFromDmprep, backfillClockCredentialsFromDmprep } from '../employees/import.js';
import { exportEmployeesToDmprep, exportEmployeeDischargeFromDmprep } from '../employees/export.js';
import { loadSyncState } from '../state.js';
import { runSyncOnce } from '../sync.js';
import { runWatchCommCollect } from '../watchcomm/trigger.js';
import { runWatchCommMasters, type WatchCommMaster } from '../watchcomm/sendMasters.js';
import { runWatchCommCommand } from '../watchcomm/command.js';
import { isSyncLocked, withSyncLock } from '../syncLock.js';
import {
  appendSyncHistory,
  mergeLastCycleIntoHistory,
  readLastCycleFile,
  type SyncHistoryKind,
} from '../syncHistory.js';

export type SyncScope =
  | 'all'
  | 'punches'
  | 'employees'
  | 'export-employees'
  | 'export-employee-discharge'
  | 'send-masters'
  | 'clear-masters'
  | 'clock-command';

export interface ManualSyncResult {
  scope: SyncScope;
  busy?: boolean;
  punches?: Awaited<ReturnType<typeof runSyncOnce>>;
  employees?: Awaited<ReturnType<typeof importEmployeesFromDmprep>>;
  credentialBackfill?: Awaited<ReturnType<typeof backfillClockCredentialsFromDmprep>>;
  export?: Awaited<ReturnType<typeof exportEmployeesToDmprep>>;
  discharge?: Awaited<ReturnType<typeof exportEmployeeDischargeFromDmprep>>;
  masters?: Awaited<ReturnType<typeof runWatchCommMasters>>;
  command?: Awaited<ReturnType<typeof runWatchCommCommand>>;
  error?: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function isAuthorized(req: IncomingMessage, apiKey: string): boolean {
  const header = req.headers['x-dmprep-sync-key'];
  const auth = req.headers.authorization ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return Boolean(apiKey && (header === apiKey || bearer === apiKey));
}

const VALID_SCOPES: ReadonlySet<SyncScope> = new Set([
  'all',
  'punches',
  'employees',
  'export-employees',
  'export-employee-discharge',
  'send-masters',
  'clear-masters',
  'clock-command',
]);

export class InvalidSyncScopeError extends Error {
  constructor(scope: string) {
    super(`Invalid sync scope: ${scope}`);
    this.name = 'InvalidSyncScopeError';
  }
}

export function parseScope(body: string): {
  scope: SyncScope;
  profileIds?: string[];
  masters?: WatchCommMaster[];
  command?: { op: string; payload?: Record<string, unknown> };
} {
  if (!body.trim()) return { scope: 'all' };
  let parsed: {
    scope?: string;
    profileIds?: string[];
    masters?: WatchCommMaster[];
    command?: { op: string; payload?: Record<string, unknown> };
  };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    throw new InvalidSyncScopeError('(malformed JSON)');
  }
  const scope = parsed.scope ?? 'all';
  if (!VALID_SCOPES.has(scope as SyncScope)) {
    throw new InvalidSyncScopeError(scope);
  }
  return {
    scope: scope as SyncScope,
    profileIds: parsed.profileIds,
    masters: parsed.masters,
    command: parsed.command,
  };
}

export function startHttpServer(
  config: SyncConfig,
  logger: pino.Logger,
): { close: () => Promise<void> } {
  if (!config.http.enabled) {
    logger.info('DMPREP HTTP control plane disabled');
    return { close: async () => {} };
  }

  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, { ok: true, service: 'dmprep-sync' });
        return;
      }

      if (req.method === 'GET' && req.url === '/status') {
        const state = await loadSyncState(config.statePath);
        const lastPunchCycle = await readLastCycleFile(config.watchcomm.resultPath);
        const history = await mergeLastCycleIntoHistory(config.statePath, lastPunchCycle);
        sendJson(res, 200, {
          ok: true,
          busy: isSyncLocked(),
          punchSource: config.movimentEnabled ? 'moviment' : 'watchcomm-tcp',
          movimentEnabled: config.movimentEnabled,
          movimentPath: config.movimentPath,
          mdbPath: config.mdbPath,
          watchcomm: config.watchcomm,
          state,
          lastPunchCycle,
          recentSyncs: history.entries,
        });
        return;
      }

      if (req.method === 'POST' && req.url === '/sync') {
        if (!isAuthorized(req, config.http.apiKey)) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }

        const body = await readBody(req);
        let scope: SyncScope;
        let profileIds: string[] | undefined;
        let masters: WatchCommMaster[] | undefined;
        let command: { op: string; payload?: Record<string, unknown> } | undefined;
        try {
          ({ scope, profileIds, masters, command } = parseScope(body));
        } catch (error) {
          if (error instanceof InvalidSyncScopeError) {
            sendJson(res, 400, { error: error.message });
            return;
          }
          throw error;
        }
        const result = await withSyncLock(async (): Promise<ManualSyncResult> => {
          const payload: ManualSyncResult = { scope };
          if (scope === 'send-masters') {
            payload.masters = await runWatchCommMasters(config, 'send', masters);
            return payload;
          }
          if (scope === 'clear-masters') {
            payload.masters = await runWatchCommMasters(config, 'clear');
            return payload;
          }
          if (scope === 'clock-command') {
            payload.command = await runWatchCommCommand(config, command?.op ?? '', command?.payload);
            return payload;
          }
          if (scope === 'export-employees') {
            payload.export = await exportEmployeesToDmprep(config, { profileIds });
            return payload;
          }
          if (scope === 'export-employee-discharge') {
            payload.discharge = await exportEmployeeDischargeFromDmprep(config, { profileIds });
            return payload;
          }
          if (scope === 'all' || scope === 'employees') {
            payload.credentialBackfill = await backfillClockCredentialsFromDmprep(config);
            payload.employees = await importEmployeesFromDmprep(config);
          }
          if (scope === 'all' || scope === 'punches') {
            payload.punches = config.movimentEnabled
              ? await runSyncOnce(config, logger)
              : await runWatchCommCollect(config, undefined, 'manual');
          }
          return payload;
        });

        if (result && 'busy' in result && result.busy) {
          sendJson(res, 409, { error: 'Sync already running', busy: true });
          return;
        }

        const manualResult = result as ManualSyncResult;
        if (manualResult && (scope === 'all' || scope === 'punches' || scope === 'employees')) {
          const kind: SyncHistoryKind =
            scope === 'all' ? 'all' : scope === 'punches' ? 'punches' : 'employees';
          try {
            await appendSyncHistory(config.statePath, {
              at: new Date().toISOString(),
              kind,
              trigger: 'manual',
              success: !manualResult.error,
              collected: manualResult.punches?.scannedLines,
              forwarded: manualResult.punches?.newRecords,
              inserted: manualResult.punches?.inserted,
              duplicates: manualResult.punches?.duplicates,
              skippedPunches: manualResult.punches?.skippedPunches,
              employeesCreated: manualResult.employees?.created,
              employeesUpdated: manualResult.employees?.updated,
              employeesFailed: manualResult.employees?.failed,
              error: manualResult.error,
            });
          } catch (historyError) {
            logger.warn({ err: historyError }, 'Failed to append sync history');
          }
        }

        logger.info(result, 'Manual DMPREP sync completed');
        sendJson(res, 200, { success: true, ...(result as ManualSyncResult) });
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      logger.error({ err: error }, 'DMPREP HTTP handler failed');
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  server.listen(config.http.port, config.http.host, () => {
    logger.info(
      { host: config.http.host, port: config.http.port },
      'DMPREP HTTP control plane listening',
    );
  });

  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
