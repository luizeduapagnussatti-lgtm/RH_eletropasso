import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { WatchCommCycleResult } from './watchcomm/trigger.js';

export type SyncHistoryTrigger = 'manual' | 'scheduled' | 'unknown';
export type SyncHistoryKind = 'punches' | 'employees' | 'all';

export interface SyncHistoryEntry {
  id: string;
  at: string;
  kind: SyncHistoryKind;
  trigger: SyncHistoryTrigger;
  success: boolean;
  collected?: number;
  forwarded?: number;
  inserted?: number;
  duplicates?: number;
  skippedPunches?: number;
  employeesCreated?: number;
  employeesUpdated?: number;
  employeesFailed?: number;
  lastNsr?: number;
  error?: string;
}

export interface SyncHistoryFile {
  updatedAt: string;
  entries: SyncHistoryEntry[];
}

const MAX_ENTRIES = 30;

function historyPathFromState(statePath: string): string {
  return path.join(path.dirname(statePath), 'sync-history.json');
}

export async function loadSyncHistory(statePath: string): Promise<SyncHistoryFile> {
  const filePath = historyPathFromState(statePath);
  try {
    const raw = (await readFile(filePath, 'utf8')).replace(/^\uFEFF/, '').trim();
    const parsed = JSON.parse(raw) as Partial<SyncHistoryFile>;
    return {
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return { updatedAt: new Date(0).toISOString(), entries: [] };
  }
}

async function saveSyncHistory(statePath: string, file: SyncHistoryFile): Promise<void> {
  const filePath = historyPathFromState(statePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
}

export async function appendSyncHistory(
  statePath: string,
  entry: Omit<SyncHistoryEntry, 'id'>,
): Promise<SyncHistoryEntry> {
  const file = await loadSyncHistory(statePath);
  const id = `${entry.at}|${entry.kind}|${entry.trigger}|${entry.inserted ?? 0}|${entry.error ?? ''}`;
  if (file.entries.some((e) => e.id === id || (e.at === entry.at && e.kind === entry.kind))) {
    return file.entries.find((e) => e.at === entry.at && e.kind === entry.kind)!;
  }
  const full: SyncHistoryEntry = { ...entry, id };
  file.entries = [full, ...file.entries].slice(0, MAX_ENTRIES);
  file.updatedAt = new Date().toISOString();
  await saveSyncHistory(statePath, file);
  return full;
}

/** Merge last WatchComm cycle file into history when the scheduled poller wrote it outside HTTP. */
export async function mergeLastCycleIntoHistory(
  statePath: string,
  cycle: WatchCommCycleResult | null,
): Promise<SyncHistoryFile> {
  if (!cycle?.finishedAt) {
    return loadSyncHistory(statePath);
  }
  const trigger: SyncHistoryTrigger =
    cycle.trigger === 'manual' || cycle.trigger === 'scheduled' ? cycle.trigger : 'unknown';
  await appendSyncHistory(statePath, {
    at: cycle.finishedAt,
    kind: 'punches',
    trigger,
    success: cycle.success !== false && !cycle.error,
    collected: cycle.collected,
    forwarded: cycle.forwarded,
    inserted: cycle.inserted,
    duplicates: cycle.duplicates,
    skippedPunches: cycle.skippedPunches,
    lastNsr: cycle.lastNsr,
    error: cycle.error || undefined,
  });
  return loadSyncHistory(statePath);
}

export async function readLastCycleFile(resultPath: string): Promise<WatchCommCycleResult | null> {
  try {
    const text = (await readFile(resultPath, 'utf8')).replace(/^\uFEFF/, '').trim();
    if (!text) return null;
    return JSON.parse(text) as WatchCommCycleResult;
  } catch {
    return null;
  }
}
