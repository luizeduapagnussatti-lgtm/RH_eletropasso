import type { ClockCommandOp, ClockCommandResult } from '../../types';

/** Matches busy responses from dmprep-sync / clock-command proxy. */
export function isClockBusyError(message: string | undefined | null): boolean {
  if (!message) return false;
  return /already running|andamento|busy/i.test(message);
}

export function digCommandValue(
  data: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (typeof value === 'object') {
      const nested = digCommandValue(value as Record<string, unknown>, [
        'value',
        'Value',
        'toString',
        'serial',
        'Serial',
        'mac',
        'MAC',
        'firmware',
        'Firmware',
      ]);
      if (nested) return nested;
      try {
        return JSON.stringify(value);
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

export function normalizePis(raw: string | undefined | null): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export function extractCommandData(result: ClockCommandResult): Record<string, unknown> {
  const cmd = result.command;
  if (!cmd || typeof cmd !== 'object') return {};
  const data = cmd.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return cmd as Record<string, unknown>;
}

export type ClockRunHandlers = {
  onBusy: () => void;
  onSuccess: (result: ClockCommandResult) => void;
  onError: (message: string) => void;
};

/**
 * Shared runner for ADMIN console tabs: handles busy flag and message matching.
 */
export async function runClockOp(
  execute: () => Promise<ClockCommandResult>,
  handlers: ClockRunHandlers,
): Promise<ClockCommandResult | null> {
  try {
    const result = await execute();
    if (result.busy || isClockBusyError(result.error)) {
      handlers.onBusy();
      return null;
    }
    handlers.onSuccess(result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isClockBusyError(message)) {
      handlers.onBusy();
      return null;
    }
    handlers.onError(message);
    return null;
  }
}

export type { ClockCommandOp };
