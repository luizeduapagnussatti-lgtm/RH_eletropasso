import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type WatchCommEncryptOptions = {
  probe: string;
  modulusHex: string;
  exponentHex: string;
  plaintextHex?: string;
  bridgeUrl?: string;
  scriptPath: string;
  powershellPath?: string;
  timeoutMs?: number;
};

export async function encryptWatchCommAck(
  options: WatchCommEncryptOptions,
): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? 15_000;

  if (options.bridgeUrl) {
    const baseUrl = options.bridgeUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/encrypt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        probe: options.probe,
        modulusHex: options.modulusHex,
        exponentHex: options.exponentHex,
        plaintextHex: options.plaintextHex ?? '',
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `WatchComm bridge failed with status ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }

    const payload = (await response.json()) as { cipherBase64?: string };
    if (!payload.cipherBase64) {
      throw new Error('WatchComm bridge response missing cipherBase64');
    }
    return Buffer.from(payload.cipherBase64, 'base64');
  }

  const powershellPath =
    options.powershellPath ??
    'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe';
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    options.scriptPath,
    '-Probe',
    options.probe,
    '-ModulusHex',
    options.modulusHex,
    '-ExponentHex',
    options.exponentHex,
  ];
  if (options.plaintextHex) {
    args.push('-PlaintextHex', options.plaintextHex);
  }

  const { stdout } = await execFileAsync(powershellPath, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: timeoutMs,
    windowsHide: true,
  });

  const line = stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) {
    throw new Error('WatchComm encrypt script returned empty output');
  }

  const cipher = Buffer.from(line, 'base64');
  if (cipher.length === 0) {
    throw new Error('WatchComm encrypt script returned invalid base64');
  }
  return cipher;
}
