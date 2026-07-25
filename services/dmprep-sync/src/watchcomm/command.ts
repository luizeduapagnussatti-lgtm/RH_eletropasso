import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SyncConfig } from '../config.js';

/** Allowed WatchComm operations exposed to RH. Dangerous ops are never listed. */
export const CLOCK_COMMAND_ALLOWLIST = [
  // Sprint 2 — read-only
  'status',
  'identity',
  'employer-read',
  'employee-list-read',
  'fingerprint-list-read',
  // Sprint 3 — low-risk writes
  'set-datetime',
  'set-dst',
  'remove-dst',
  'include-holidays',
  'send-display-message',
  'clear-display-message',
  // Sprint 4 — employees / biometrics
  'send-employees',
  'remove-employee',
  'exclude-fingerprint',
  'exclude-fingerprint-orphans',
  // Sprint 5 — settings / employer
  'program-biometric-reader-use',
  'program-trigger-type',
  'update-communication-user',
  'set-net-info',
  'change-employer',
] as const;

export type ClockCommandOp = (typeof CLOCK_COMMAND_ALLOWLIST)[number];

export const CLOCK_COMMAND_DENYLIST = [
  'UpdateFirmware',
  'ActivateBootLoader',
  'EraseMarkingPoints',
  'ReplaceMRP',
  'ClearAllRegisters',
  'CleanEssentialVariables',
  'ExchangeSealREP',
] as const;

export function isAllowedClockCommand(op: string): op is ClockCommandOp {
  return (CLOCK_COMMAND_ALLOWLIST as readonly string[]).includes(op);
}

export interface WatchCommCommandResult {
  success: boolean;
  op: string;
  data?: Record<string, unknown>;
  finishedAt?: string;
  error?: string | null;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export async function runWatchCommCommand(
  config: SyncConfig,
  op: string,
  payload: Record<string, unknown> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<WatchCommCommandResult> {
  if (!op || !isAllowedClockCommand(op)) {
    throw new Error(`Clock command not allowed: ${op || '(empty)'}`);
  }
  if ((CLOCK_COMMAND_DENYLIST as readonly string[]).includes(op)) {
    throw new Error(`Clock command permanently denied: ${op}`);
  }

  const workDir = await mkdtemp(join(tmpdir(), 'watchcomm-cmd-'));
  const payloadPath = join(workDir, 'payload.json');
  const resultPath = join(workDir, 'result.json');
  const scriptPath = join(dirname(config.watchcomm.pollerScript), 'Invoke-WatchCommCommand.ps1');
  const powershellX86 = join(
    process.env.WINDIR ?? 'C:\\Windows',
    'SysWOW64',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );

  try {
    await writeFile(payloadPath, JSON.stringify({ op, payload }), {
      encoding: 'utf8',
      mode: 0o600,
    });

    await new Promise<void>((resolve, reject) => {
      const args = [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-Operation',
        op,
        '-PayloadPath',
        payloadPath,
        '-ConfigPath',
        config.watchcomm.configPath,
        '-ResultPath',
        resultPath,
      ];

      const child = spawn(powershellX86, args, { windowsHide: true });
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`WatchComm command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else {
          reject(
            new Error(
              `WatchComm command exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr.trim()}` : ''}`,
            ),
          );
        }
      });
    });

    const raw = await readFile(resultPath, 'utf8');
    const result = JSON.parse(raw.replace(/^\uFEFF/, '')) as WatchCommCommandResult;
    if (!result.success || result.error) {
      throw new Error(result.error || `WatchComm command ${op} failed`);
    }
    return result;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
