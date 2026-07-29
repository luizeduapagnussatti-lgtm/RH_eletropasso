import type { MessagingBatchOptions, MessagingChannel, OrgMessagingConfig } from '../types';

export type MessagingEmployeeLike = {
  id: string;
  name: string;
  email?: string;
  whatsappE164?: string;
  whatsappOptIn?: boolean;
  messagingChannelPref?: MessagingChannel[];
};

export function resolveThrottleFromConfig(config: OrgMessagingConfig): MessagingBatchOptions {
  return {
    whatsappDelayMs: (config.whatsappDelaySeconds ?? 4) * 1000,
    emailDelayMs: config.emailDelayMs ?? 800,
    jitterMs: 800,
    pauseEveryWhatsapp: config.batchPauseEvery ?? 10,
    pauseDurationMs: (config.batchPauseSeconds ?? 15) * 1000,
    maxConsecutiveFailures: 3,
  };
}

export function isEligibleForChannel(
  emp: MessagingEmployeeLike,
  channel: 'EMAIL' | 'WHATSAPP',
): boolean {
  const prefs = emp.messagingChannelPref ?? ['APP', 'EMAIL'];
  if (!prefs.includes(channel)) return false;
  if (channel === 'WHATSAPP') {
    return !!emp.whatsappOptIn && !!emp.whatsappE164;
  }
  return !!emp.email;
}

export function filterEligibleEmployees(
  employees: MessagingEmployeeLike[],
  channels: MessagingChannel[],
  selectedIds?: Set<string>,
): MessagingEmployeeLike[] {
  const external = channels.filter(c => c === 'EMAIL' || c === 'WHATSAPP') as ('EMAIL' | 'WHATSAPP')[];
  if (external.length === 0) return [];

  return employees.filter(emp => {
    if (selectedIds && !selectedIds.has(emp.id)) return false;
    return external.some(ch => isEligibleForChannel(emp, ch));
  });
}

export function countDispatchItems(
  employees: MessagingEmployeeLike[],
  channels: MessagingChannel[],
): number {
  const external = channels.filter(c => c === 'EMAIL' || c === 'WHATSAPP') as ('EMAIL' | 'WHATSAPP')[];
  let count = 0;
  for (const emp of employees) {
    for (const ch of external) {
      if (isEligibleForChannel(emp, ch)) count++;
    }
  }
  return count;
}

export function estimateDispatchDurationMs(
  whatsappCount: number,
  emailCount: number,
  options: MessagingBatchOptions,
): number {
  const waDelay = options.whatsappDelayMs ?? 4000;
  const emailDelay = options.emailDelayMs ?? 800;
  const pauseEvery = options.pauseEveryWhatsapp ?? 10;
  const pauseDuration = options.pauseDurationMs ?? 15000;

  let ms = 0;
  if (whatsappCount > 0) {
    ms += whatsappCount * (waDelay + (options.jitterMs ?? 800) / 2);
    const pauses = Math.floor((whatsappCount - 1) / pauseEvery);
    ms += pauses * pauseDuration;
  }
  if (emailCount > 0) {
    ms += emailCount * emailDelay;
  }
  return ms;
}

export function formatDurationSeconds(totalMs: number): number {
  return Math.ceil(totalMs / 1000);
}

/** Split items so each chunk stays within WhatsApp-per-request limits (edge timeout safety). */
export function chunkDispatchItems<T extends { channel: 'EMAIL' | 'WHATSAPP' }>(
  items: T[],
  maxWhatsappPerChunk: number,
): T[][] {
  if (items.length === 0) return [];
  const maxWa = Math.max(1, Math.min(maxWhatsappPerChunk, 20));
  const chunks: T[][] = [];
  let current: T[] = [];
  let waInChunk = 0;

  for (const item of items) {
    if (item.channel === 'WHATSAPP' && waInChunk >= maxWa) {
      if (current.length > 0) chunks.push(current);
      current = [];
      waInChunk = 0;
    }
    current.push(item);
    if (item.channel === 'WHATSAPP') waInChunk++;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
