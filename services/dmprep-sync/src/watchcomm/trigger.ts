import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import type { SyncConfig } from '../config.js';
import type { SyncRunResult } from '../sync.js';

export interface WatchCommCycleResult {
  success?: boolean;
  exitCode?: number;
  collected?: number;
  forwarded?: number;
  inserted?: number;
  duplicates?: number;
  skippedPunches?: number;
  skippedEmployeeIds?: string[];
  lastNsr?: number;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 300_000;

function mapCycleResult(raw: WatchCommCycleResult): SyncRunResult {
  const forwarded = raw.forwarded ?? 0;
  const inserted = raw.inserted ?? 0;
  const duplicates =
    raw.duplicates ?? Math.max(0, forwarded - inserted);

  return {
    scannedLines: raw.collected ?? forwarded,
    newRecords: forwarded,
    inserted,
    duplicates,
    skippedPunches: raw.skippedPunches ?? 0,
    skippedEmployeeIds: raw.skippedEmployeeIds ?? [],
    skipped: forwarded === 0 && inserted === 0,
    resetCursor: false,
  };
}

async function readCycleResult(resultPath: string): Promise<WatchCommCycleResult> {
  const text = await readFile(resultPath, 'utf8');
  return JSON.parse(text) as WatchCommCycleResult;
}

export async function runWatchCommCollect(
  config: SyncConfig,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<SyncRunResult> {
  const { pollerScript, configPath, resultPath } = config.watchcomm;

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        pollerScript,
        '-ConfigPath',
        configPath,
      ],
      { windowsHide: true },
    );

    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`WatchComm poller timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `WatchComm poller exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr.trim()}` : ''}`,
        ),
      );
    });
  });

  const raw = await readCycleResult(resultPath);
  if (raw.success === false || raw.error) {
    throw new Error(raw.error ?? 'WatchComm collect failed');
  }

  return mapCycleResult(raw);
}
