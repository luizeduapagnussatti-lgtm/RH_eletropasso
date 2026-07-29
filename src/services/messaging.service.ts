import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import { organizationService } from './organization.service';
import type {
  MessagingBatchOptions,
  MessagingChannel,
  MessagingDispatchItem,
  MessagingDispatchResult,
  MessagingOutboxEntry,
} from '../types';
import {
  chunkDispatchItems,
  resolveThrottleFromConfig,
} from '../utils/messagingThrottle';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : null;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function mapOutboxRow(r: Record<string, unknown>): MessagingOutboxEntry {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    channel: r.channel as 'EMAIL' | 'WHATSAPP',
    recipientProfileId: r.recipient_profile_id ? String(r.recipient_profile_id) : undefined,
    recipient: String(r.recipient ?? ''),
    subject: r.subject ? String(r.subject) : undefined,
    body: String(r.body ?? ''),
    mediaFileName: r.media_file_name ? String(r.media_file_name) : undefined,
    status: r.status as MessagingOutboxEntry['status'],
    errorMessage: r.error_message ? String(r.error_message) : undefined,
    referenceType: r.reference_type ? String(r.reference_type) : undefined,
    referenceId: r.reference_id ? String(r.reference_id) : undefined,
    sentAt: r.sent_at ? String(r.sent_at) : undefined,
    created: String(r.created),
    updated: String(r.updated),
  };
}

export const messagingService = {
  async checkHealth(): Promise<{ connected: boolean; resendConfigured: boolean; error?: string }> {
    if (!FUNCTIONS_URL || !isSupabaseConfigured()) {
      return { connected: false, resendConfigured: false, error: 'Not configured' };
    }
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${FUNCTIONS_URL}/messaging-dispatch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'health' }),
      });
      const data = await res.json();
      return {
        connected: !!data.evolution?.connected,
        resendConfigured: !!data.resend?.configured,
        error: data.evolution?.error,
      };
    } catch (e) {
      return {
        connected: false,
        resendConfigured: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  async dispatchSingle(item: MessagingDispatchItem & { channel: 'EMAIL' | 'WHATSAPP' }): Promise<MessagingDispatchResult> {
    if (!FUNCTIONS_URL || !isSupabaseConfigured()) {
      throw new Error('Messaging not configured');
    }
    const headers = await getAuthHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/messaging-dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'send', ...item }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Dispatch failed');
    return data.result as MessagingDispatchResult;
  },

  async dispatchBatch(
    items: Array<MessagingDispatchItem & { channel: 'EMAIL' | 'WHATSAPP' }>,
    throttle?: MessagingBatchOptions,
  ): Promise<{ sent: number; failed: number; skipped: number; paused?: boolean; results: MessagingDispatchResult[] }> {
    if (!FUNCTIONS_URL || !isSupabaseConfigured()) {
      throw new Error('Messaging not configured');
    }
    const headers = await getAuthHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/messaging-dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'batch', items, throttle }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Batch dispatch failed');
    return {
      sent: data.sent ?? 0,
      failed: data.failed ?? 0,
      skipped: data.skipped ?? 0,
      paused: data.paused,
      results: data.results ?? [],
    };
  },

  /**
   * Dispatches in chunks with throttle from org config — avoids edge timeout and Meta rate limits.
   */
  async dispatchBatchSafe(
    items: Array<MessagingDispatchItem & { channel: 'EMAIL' | 'WHATSAPP' }>,
    options?: {
      onProgress?: (message: string) => void;
      throttle?: MessagingBatchOptions;
      maxWhatsappPerChunk?: number;
      pauseBetweenChunksMs?: number;
    },
  ): Promise<{ sent: number; failed: number; skipped: number; paused: boolean }> {
    const messagingConfig = await organizationService.getMessagingConfig();
    const throttle = options?.throttle ?? resolveThrottleFromConfig(messagingConfig);
    const maxWa = options?.maxWhatsappPerChunk ?? messagingConfig.maxWhatsappPerBatch ?? 25;
    const chunks = chunkDispatchItems(items, maxWa);
    const betweenChunks = options?.pauseBetweenChunksMs ?? (messagingConfig.batchPauseSeconds ?? 15) * 1000;

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let paused = false;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      if (chunks.length > 1) {
        options?.onProgress?.(`Lote ${i + 1}/${chunks.length}…`);
      }
      const result = await this.dispatchBatch(chunk, throttle);
      sent += result.sent;
      failed += result.failed;
      skipped += result.skipped;
      if (result.paused) paused = true;

      if (i < chunks.length - 1 && !paused) {
        options?.onProgress?.(`Pausa de segurança entre lotes…`);
        await new Promise(r => setTimeout(r, betweenChunks));
      } else if (paused) {
        break;
      }
    }

    return { sent, failed, skipped, paused };
  },

  async retryOutbox(outboxId: string): Promise<MessagingDispatchResult> {
    if (!FUNCTIONS_URL || !isSupabaseConfigured()) {
      throw new Error('Messaging not configured');
    }
    const headers = await getAuthHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/messaging-dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'retry', outboxId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Retry failed');
    return data.result as MessagingDispatchResult;
  },

  async listOutbox(params?: {
    referenceType?: string;
    referenceId?: string;
    status?: string;
    limit?: number;
  }): Promise<MessagingOutboxEntry[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];

    let query = supabase
      .from('messaging_outbox')
      .select('*')
      .eq('organization_id', orgId)
      .order('created', { ascending: false })
      .limit(params?.limit ?? 200);

    if (params?.referenceType) query = query.eq('reference_type', params.referenceType);
    if (params?.referenceId) query = query.eq('reference_id', params.referenceId);
    if (params?.status) query = query.eq('status', params.status);

    const { data, error } = await query;
    if (error) {
      console.error('[messagingService] listOutbox', error.message);
      return [];
    }
    return (data ?? []).map(mapOutboxRow);
  },

  /** Build dispatch items for roster month publish */
  buildRosterPublishItems(
    employees: Array<{ id: string; name: string; email?: string; whatsappE164?: string; whatsappOptIn?: boolean; messagingChannelPref?: MessagingChannel[] }>,
    channels: MessagingChannel[],
    monthLabel: string,
    pdfBase64ByEmployee: Map<string, { base64: string; fileName: string }>,
    referenceId: string,
    selectedEmployeeIds?: Set<string>,
  ): Array<MessagingDispatchItem & { channel: 'EMAIL' | 'WHATSAPP' }> {
    const items: Array<MessagingDispatchItem & { channel: 'EMAIL' | 'WHATSAPP' }> = [];
    const caption = `Olá! Segue sua escala de ${monthLabel}. Qualquer dúvida ou troca, acesse o app RH Eletropasso.`;

    for (const emp of employees) {
      if (selectedEmployeeIds && !selectedEmployeeIds.has(emp.id)) continue;
      const prefs = emp.messagingChannelPref ?? ['APP', 'EMAIL'];
      const pdf = pdfBase64ByEmployee.get(emp.id);

      if (channels.includes('WHATSAPP') && prefs.includes('WHATSAPP') && emp.whatsappOptIn) {
        items.push({
          channel: 'WHATSAPP',
          recipientProfileId: emp.id,
          recipientPhone: emp.whatsappE164,
          body: caption,
          mediaBase64: pdf?.base64,
          mediaFileName: pdf?.fileName ?? `escala-${monthLabel.replace(/\s+/g, '-')}.pdf`,
          referenceType: 'roster_month',
          referenceId,
        });
      }

      if (channels.includes('EMAIL') && prefs.includes('EMAIL') && emp.email) {
        items.push({
          channel: 'EMAIL',
          recipientProfileId: emp.id,
          recipientEmail: emp.email,
          subject: `Escala ${monthLabel} — Eletropasso`,
          body: `${caption}\n\nAnexo: calendário de escala em PDF.`,
          mediaBase64: pdf?.base64,
          mediaFileName: pdf?.fileName ?? `escala-${monthLabel.replace(/\s+/g, '-')}.pdf`,
          referenceType: 'roster_month',
          referenceId,
        });
      }
    }
    return items;
  },
};
