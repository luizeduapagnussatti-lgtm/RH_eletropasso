import type { HardwareSyncQueueJob, HardwareSyncStatus } from '../types';
import { clockCommandService } from './clockCommand.service';
import { isSupabaseConfigured, supabase } from './supabase';
import { apiClient } from './api.client';
import { clockCredentialSignificantDigits, normalizePis, toWatchCommSendEmployee } from '../utils/employeeCredentials';

function mapRow(r: Record<string, unknown>): HardwareSyncQueueJob {
  const target = r.target_employee as { name?: string; employee_id?: string } | null | undefined;
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    commandType: r.command_type as HardwareSyncQueueJob['commandType'],
    targetEmployeeId: r.target_employee_id ? String(r.target_employee_id) : undefined,
    status: r.status as HardwareSyncStatus,
    payload: (r.payload as HardwareSyncQueueJob['payload']) || {},
    hardwareResponse: (r.hardware_response as Record<string, unknown> | null) ?? null,
    errorMessage: (r.error_message as string | null) ?? null,
    attemptCount: Number(r.attempt_count || 0),
    maxAttempts: Number(r.max_attempts || 3),
    lastAttemptAt: (r.last_attempt_at as string | null) ?? null,
    nextRetryAt: (r.next_retry_at as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
    targetEmployeeName: target?.name,
  };
}

export const hardwareSyncQueueService = {
  async listPending(organizationId?: string): Promise<HardwareSyncQueueJob[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = organizationId || apiClient.getOrganizationId();
    if (!orgId) return [];

    const { data, error } = await supabase
      .from('hardware_sync_queue')
      .select('*, target_employee:profiles!hardware_sync_queue_target_employee_id_fkey(name, employee_id)')
      .eq('organization_id', orgId)
      .in('status', ['PENDING', 'IN_PROGRESS', 'FAILED'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      // Fallback without join if FK name differs
      const fallback = await supabase
        .from('hardware_sync_queue')
        .select('*')
        .eq('organization_id', orgId)
        .in('status', ['PENDING', 'IN_PROGRESS', 'FAILED'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (fallback.error) throw fallback.error;
      return (fallback.data || []).map((row) => mapRow(row as Record<string, unknown>));
    }

    return (data || []).map((row) => mapRow(row as Record<string, unknown>));
  },

  async countPending(organizationId?: string): Promise<number> {
    if (!isSupabaseConfigured()) return 0;
    const orgId = organizationId || apiClient.getOrganizationId();
    if (!orgId) return 0;

    const { count, error } = await supabase
      .from('hardware_sync_queue')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .in('status', ['PENDING', 'IN_PROGRESS', 'FAILED']);

    if (error) {
      console.warn('[hardwareSyncQueue] countPending failed:', error.message);
      return 0;
    }
    return count ?? 0;
  },

  async enqueue(input: {
    organizationId: string;
    commandType: HardwareSyncQueueJob['commandType'];
    targetEmployeeId?: string;
    payload: HardwareSyncQueueJob['payload'];
    createdBy?: string | null;
  }): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { error } = await supabase.from('hardware_sync_queue').insert({
      organization_id: input.organizationId,
      command_type: input.commandType,
      target_employee_id: input.targetEmployeeId ?? null,
      status: 'PENDING',
      payload: input.payload,
      created_by: input.createdBy ?? null,
    });
    if (error) throw error;
  },

  async processCommand(queueId: string): Promise<{ success: boolean; message?: string }> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data: job, error: fetchErr } = await supabase
      .from('hardware_sync_queue')
      .select('*')
      .eq('id', queueId)
      .single();

    if (fetchErr || !job) throw new Error('Queue job not found');
    if (job.status === 'CONFIRMED') return { success: true, message: 'Already confirmed' };
    if (job.status === 'CANCELLED') throw new Error('Command was cancelled');

    const nextAttempt = Number(job.attempt_count || 0) + 1;

    await supabase
      .from('hardware_sync_queue')
      .update({
        status: 'IN_PROGRESS',
        last_attempt_at: new Date().toISOString(),
        attempt_count: nextAttempt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueId);

    try {
      let result;
      const payload = (job.payload || {}) as {
        pis?: string;
        name?: string;
        credential?: string;
      };

      switch (job.command_type) {
        case 'ADD_EMPLOYEE': {
          const row = toWatchCommSendEmployee({
            name: payload.name || '',
            employeeId: payload.pis,
            clockCredential: payload.credential,
          });
          if (!row) throw new Error('Invalid ADD_EMPLOYEE payload (PIS required)');
          result = await clockCommandService.run('send-employees', { employees: [row] });
          break;
        }
        case 'REMOVE_EMPLOYEE': {
          const pis = normalizePis(payload.pis || '');
          if (!pis) throw new Error('Invalid REMOVE_EMPLOYEE payload (PIS required)');
          result = await clockCommandService.run('remove-employee', { pis });
          break;
        }
        default:
          throw new Error(`Unsupported command type: ${job.command_type}`);
      }

      if (!result.success || result.busy) {
        throw new Error(result.error || (result.busy ? 'Clock busy' : 'Clock command failed'));
      }

      await supabase
        .from('hardware_sync_queue')
        .update({
          status: 'CONFIRMED',
          hardware_response: result.command ?? result,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', queueId);

      if (job.target_employee_id && job.command_type === 'REMOVE_EMPLOYEE') {
        await supabase
          .from('profiles')
          .update({
            clock_discharge_status: 'HARDWARE_CONFIRMED',
            updated: new Date().toISOString(),
          })
          .eq('id', job.target_employee_id);
      }

      if (job.target_employee_id && job.command_type === 'ADD_EMPLOYEE') {
        await supabase
          .from('profiles')
          .update({
            clock_onboarding_status: 'PENDING_BIO',
            clock_onboarding_at: new Date().toISOString(),
            clock_onboarding_notes: 'Enviado ao PrintPoint via fila hardware_sync_queue',
            updated: new Date().toISOString(),
          })
          .eq('id', job.target_employee_id);
      }

      apiClient.notify();
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const maxAttempts = Number(job.max_attempts || 3);
      const isFailed = nextAttempt >= maxAttempts;

      await supabase
        .from('hardware_sync_queue')
        .update({
          status: isFailed ? 'FAILED' : 'PENDING',
          error_message: message.slice(0, 500),
          next_retry_at: isFailed
            ? null
            : new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', queueId);

      if (isFailed && job.target_employee_id && job.command_type === 'REMOVE_EMPLOYEE') {
        await supabase
          .from('profiles')
          .update({
            clock_discharge_status: 'HARDWARE_FAILED',
            updated: new Date().toISOString(),
          })
          .eq('id', job.target_employee_id);
      }

      throw err instanceof Error ? err : new Error(message);
    }
  },

  async cancelCommand(queueId: string): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { error } = await supabase
      .from('hardware_sync_queue')
      .update({
        status: 'CANCELLED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueId);
    if (error) throw error;
  },
};

/** Helper for display of short credential from a queue payload. */
export function formatQueueCredential(payload: HardwareSyncQueueJob['payload']): string {
  return clockCredentialSignificantDigits(payload.credential as string | undefined) || '—';
}
