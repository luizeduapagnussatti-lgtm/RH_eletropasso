import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SyncConfig } from '../config.js';

export interface WatchCommMaster {
  code: string;
  pis: string;
  password: string;
  hasTechnicalPermission: boolean;
  hasDatetimePermission: boolean;
  hasPendrivePermission: boolean;
  hasBobbinPermission: boolean;
}

export interface WatchCommMastersResult {
  success: boolean;
  action: 'send' | 'clear';
  supervisorCount: number;
  finishedAt?: string;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 90_000;

export async function runWatchCommMasters(
  config: SyncConfig,
  action: 'send' | 'clear',
  masters: WatchCommMaster[] = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<WatchCommMastersResult> {
  if (action === 'send' && (masters.length < 1 || masters.length > 5)) {
    throw new Error('Send requires between 1 and 5 active supervisors');
  }

  const workDir = await mkdtemp(join(tmpdir(), 'watchcomm-masters-'));
  const payloadPath = join(workDir, 'masters.json');
  const resultPath = join(workDir, 'result.json');
  const scriptPath = join(dirname(config.watchcomm.pollerScript), 'Send-WatchCommMasters.ps1');
  const powershellX86 = join(
    process.env.WINDIR ?? 'C:\\Windows',
    'SysWOW64',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );

  try {
    if (action === 'send') {
      await writeFile(payloadPath, JSON.stringify({ masters }), {
        encoding: 'utf8',
        mode: 0o600,
      });
    }

    await new Promise<void>((resolve, reject) => {
      const args = [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-Action',
        action === 'send' ? 'Send' : 'Clear',
        '-ConfigPath',
        config.watchcomm.configPath,
        '-ResultPath',
        resultPath,
      ];
      if (action === 'send') args.push('-PayloadPath', payloadPath);

      const process = spawn(powershellX86, args, { windowsHide: true });
      let stderr = '';
      process.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      const timer = setTimeout(() => {
        process.kill();
        reject(new Error(`WatchComm masters command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      process.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      process.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`WatchComm masters exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr.trim()}` : ''}`));
      });
    });

    const raw = await readFile(resultPath, 'utf8');
    const result = JSON.parse(raw.replace(/^\uFEFF/, '')) as WatchCommMastersResult;
    if (!result.success || result.error) throw new Error(result.error || 'WatchComm masters command failed');
    return result;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
