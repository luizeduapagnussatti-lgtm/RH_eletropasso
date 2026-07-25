import type { ClockCommandLogEntry, ClockCommandOp, ClockCommandResult } from '../types';
import { isSupabaseConfigured, supabase } from './supabase';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

/** Ops allowlist matching supabase/functions/clock-command and dmprep-sync WatchComm. */
export const CLOCK_COMMAND_OPS = [
  'status',
  'identity',
  'employer-read',
  'employee-list-read',
  'fingerprint-list-read',
  'set-datetime',
  'set-dst',
  'remove-dst',
  'include-holidays',
  'send-display-message',
  'clear-display-message',
  'send-employees',
  'remove-employee',
  'exclude-fingerprint',
  'exclude-fingerprint-orphans',
  'program-biometric-reader-use',
  'program-trigger-type',
  'update-communication-user',
  'set-net-info',
  'change-employer',
] as const satisfies readonly ClockCommandOp[];

function isAllowedOp(op: string): op is ClockCommandOp {
  return (CLOCK_COMMAND_OPS as readonly string[]).includes(op);
}

async function authHeaders(): Promise<HeadersInit> {
  if (!isSupabaseConfigured() || !FUNCTIONS_URL) {
    throw new Error('Supabase is not configured');
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

export const clockCommandService = {
  async run(op: ClockCommandOp, payload: Record<string, unknown> = {}): Promise<ClockCommandResult> {
    if (!isAllowedOp(op)) {
      throw new Error(`Clock command not allowed: ${op}`);
    }

    const response = await fetch(`${FUNCTIONS_URL}/clock-command`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ op, payload }),
    });

    const body = (await response.json()) as ClockCommandResult & {
      error?: string;
      message?: string;
      busy?: boolean;
    };

    if (body.busy || response.status === 409) {
      return { success: false, op, busy: true, error: body.error || body.message };
    }

    if (!response.ok) {
      throw new Error(body.error || body.message || 'Clock command failed');
    }

    return {
      success: true,
      op,
      command: (body.command ?? body) as Record<string, unknown>,
    };
  },

  async list(): Promise<ClockCommandLogEntry[]> {
    const response = await fetch(`${FUNCTIONS_URL}/clock-command`, {
      method: 'GET',
      headers: await authHeaders(),
    });

    const body = (await response.json()) as { commands?: ClockCommandLogEntry[]; error?: string };
    if (!response.ok) {
      throw new Error(body.error || 'Failed to load clock command log');
    }
    return body.commands ?? [];
  },
};
