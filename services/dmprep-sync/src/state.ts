import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface SyncState {
  recordCount: number;
  fileSize: number;
  lastModifiedMs: number;
  lastSyncAt: string;
  lastError?: string;
}

export const EMPTY_SYNC_STATE: SyncState = {
  recordCount: 0,
  fileSize: 0,
  lastModifiedMs: 0,
  lastSyncAt: new Date(0).toISOString(),
};

export async function loadSyncState(statePath: string): Promise<SyncState> {
  try {
    const raw = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SyncState> & { lineCount?: number };
    return {
      recordCount: parsed.recordCount ?? parsed.lineCount ?? 0,
      fileSize: parsed.fileSize ?? 0,
      lastModifiedMs: parsed.lastModifiedMs ?? 0,
      lastSyncAt: parsed.lastSyncAt ?? new Date(0).toISOString(),
      lastError: parsed.lastError,
    };
  } catch {
    return { ...EMPTY_SYNC_STATE };
  }
}

export async function saveSyncState(statePath: string, state: SyncState): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
