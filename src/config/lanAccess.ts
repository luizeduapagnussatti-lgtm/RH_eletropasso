/** Canonical RH URL on the Eletropasso LAN (NPM + HTTPS). Override via VITE_LAN_SHARE_URL. */
export const ELETROPASSO_RH_URL = 'https://rh.eletropasso.local';
export const ELETROPASSO_API_HOST = 'api-rh.eletropasso.local';
/** Server that runs NPM / Supabase / Vite (LAN). */
export const ELETROPASSO_RH_SERVER_IP = '192.168.15.245';

function normalizeShareUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * URL to share with store staff. Defaults to https://rh.eletropasso.local.
 * Other PCs need hosts entry + trusted LAN certificate (see scripts/lan-client/).
 */
export function getLanShareUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_LAN_SHARE_URL;
  if (env?.trim()) return normalizeShareUrl(env);

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'rh.eletropasso.local') {
      return ELETROPASSO_RH_URL;
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return ELETROPASSO_RH_URL;
    }
  }

  return ELETROPASSO_RH_URL;
}

/** True when the browser address bar is not the canonical store URL (dev / wrong host). */
export function isUnshareableHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function needsLanClientSetup(hostname: string): boolean {
  return hostname !== 'rh.eletropasso.local' && hostname !== 'api-rh.eletropasso.local';
}
