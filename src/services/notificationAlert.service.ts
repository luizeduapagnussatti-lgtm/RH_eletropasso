/**
 * In-app notification chime + OS toast when the tab is hidden.
 * Audio unlock requires a user gesture (PushPermissionPrompt / prefs toggle).
 */
import { organizationService } from './organization.service';
import type { NotificationType, OrgNotificationConfig } from '../types';
import { DEFAULT_NOTIFICATION_CONFIG } from '../constants';

export type NotificationAlertInput = {
  id: string;
  title: string;
  body?: string;
  type?: NotificationType;
  soundEnabled?: boolean;
  mutedTypes?: NotificationType[];
};

let audioCtx: AudioContext | null = null;
let audioUnlocked = false;
const recentAlertIds = new Set<string>();
const RECENT_TTL_MS = 60_000;

function pruneRecent(now: number) {
  // Set has no timestamps — clear wholesale when large to avoid unbounded growth
  if (recentAlertIds.size > 200) recentAlertIds.clear();
  void now;
}

function parseHmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** True when current local time falls in org quiet hours (supports overnight window). */
export function isInQuietHours(config: OrgNotificationConfig, now = new Date()): boolean {
  if (!config.quietHoursEnabled) return false;
  const start = parseHmToMinutes(config.quietHoursStart);
  const end = parseHmToMinutes(config.quietHoursEnd);
  if (start == null || end == null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  if (start < end) return cur >= start && cur < end;
  // Overnight e.g. 22:00 → 07:00
  return cur >= start || cur < end;
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

/** Call from a user gesture so later chimes are allowed by autoplay policy. */
export async function unlockNotificationAudio(): Promise<boolean> {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    // Silent blip to fully unlock on some mobile browsers
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    audioUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

export function isNotificationAudioUnlocked(): boolean {
  return audioUnlocked;
}

/** Short two-tone chime (no asset file). */
export async function playNotificationChime(): Promise<void> {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const now = ctx.currentTime;
    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.12, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    };
    playTone(880, 0, 0.12);
    playTone(1174.66, 0.14, 0.16);
    audioUnlocked = true;
  } catch (e) {
    console.warn('[notificationAlert] chime failed', e);
  }
}

async function loadQuietConfig(): Promise<OrgNotificationConfig> {
  try {
    return await organizationService.getNotificationConfig();
  } catch {
    return DEFAULT_NOTIFICATION_CONFIG;
  }
}

function showOsToast(title: string, body: string | undefined, tag: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  try {
    const n = new Notification(title || 'RH_Eletropasso', {
      body: body || '',
      icon: '/img/icon-192.png',
      badge: '/img/favicon-32.png',
      tag: tag || 'rh-inapp',
      renotify: true,
      silent: false,
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      n.close();
    };
  } catch (e) {
    console.warn('[notificationAlert] OS Notification failed', e);
  }
}

/**
 * Play chime (if enabled) and optionally show OS toast when the tab is hidden.
 * Dedupes by notification id for ~60s.
 */
export async function alertOnNewNotification(input: NotificationAlertInput): Promise<void> {
  const {
    id,
    title,
    body,
    type,
    soundEnabled = true,
    mutedTypes = [],
  } = input;

  if (!id) return;
  if (recentAlertIds.has(id)) return;
  recentAlertIds.add(id);
  pruneRecent(Date.now());
  window.setTimeout(() => recentAlertIds.delete(id), RECENT_TTL_MS);

  if (type && mutedTypes.includes(type)) return;

  const config = await loadQuietConfig();
  if (isInQuietHours(config)) return;

  if (soundEnabled) {
    void playNotificationChime();
  }

  showOsToast(title, body, `rh-${id}`);
}
