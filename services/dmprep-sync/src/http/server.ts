import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import pino from 'pino';
import type { SyncConfig } from '../config.js';
import { importEmployeesFromDmprep } from '../employees/import.js';
import { loadSyncState } from '../state.js';
import { runSyncOnce } from '../sync.js';
import { runWatchCommCollect } from '../watchcomm/trigger.js';
import { isSyncLocked, withSyncLock } from '../syncLock.js';

export type SyncScope = 'all' | 'punches' | 'employees';

export interface ManualSyncResult {
  scope: SyncScope;
  busy?: boolean;
  punches?: Awaited<ReturnType<typeof runSyncOnce>>;
  employees?: Awaited<ReturnType<typeof importEmployeesFromDmprep>>;
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

function parseScope(body: string): SyncScope {
  if (!body.trim()) return 'all';
  try {
    const parsed = JSON.parse(body) as { scope?: string };
    if (parsed.scope === 'punches' || parsed.scope === 'employees' || parsed.scope === 'all') {
      return parsed.scope;
    }
  } catch {
    // default
  }
  return 'all';
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
        sendJson(res, 200, {
          ok: true,
          busy: isSyncLocked(),
          punchSource: config.movimentEnabled ? 'moviment' : 'watchcomm-tcp',
          movimentEnabled: config.movimentEnabled,
          movimentPath: config.movimentPath,
          mdbPath: config.mdbPath,
          watchcomm: config.watchcomm,
          state,
        });
        return;
      }

      if (req.method === 'POST' && req.url === '/sync') {
        if (!isAuthorized(req, config.http.apiKey)) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }

        const body = await readBody(req);
        const scope = parseScope(body);
        const result = await withSyncLock(async (): Promise<ManualSyncResult> => {
          const payload: ManualSyncResult = { scope };
          if (scope === 'all' || scope === 'employees') {
            payload.employees = await importEmployeesFromDmprep(config);
          }
          if (scope === 'all' || scope === 'punches') {
            payload.punches = config.movimentEnabled
              ? await runSyncOnce(config, logger)
              : await runWatchCommCollect(config);
          }
          return payload;
        });

        if (result && 'busy' in result && result.busy) {
          sendJson(res, 409, { error: 'Sync already running', busy: true });
          return;
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
