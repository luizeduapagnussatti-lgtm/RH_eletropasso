/**
 * PWA punch helpers: permission probe + last-known GPS cache.
 * Browser permissions are per-origin (installed PWA ≠ Chrome tab).
 */

export type MediaPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

const GEO_CACHE_KEY = 'openhr_pwa_last_geo_v1';
const MEDIA_READY_KEY = 'openhr_pwa_media_ready_v1';

/** Reuse last GPS for up to 15 minutes when a fresh fix is slow. */
export const GEO_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

export type CachedGeo = {
  lat: number;
  lng: number;
  address: string;
  accuracy?: number | null;
  at: number;
};

export type MediaReadyMark = {
  at: number;
  geoOk: boolean;
  cameraOk: boolean;
};

export function isSecureMediaContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true
  );
}

async function queryPermission(name: PermissionName): Promise<MediaPermissionState> {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name });
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state;
    }
    return 'unknown';
  } catch {
    // Firefox/Safari may throw for camera / geolocation names.
    return 'unknown';
  }
}

export async function queryGeolocationPermission(): Promise<MediaPermissionState> {
  return queryPermission('geolocation' as PermissionName);
}

export async function queryCameraPermission(): Promise<MediaPermissionState> {
  // Chromium: "camera"; others may not support — treat as unknown.
  return queryPermission('camera' as PermissionName);
}

export function readCachedGeo(maxAgeMs: number = GEO_CACHE_MAX_AGE_MS): CachedGeo | null {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedGeo;
    if (
      !Number.isFinite(parsed?.lat) ||
      !Number.isFinite(parsed?.lng) ||
      !Number.isFinite(parsed?.at)
    ) {
      return null;
    }
    if (Date.now() - parsed.at > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedGeo(geo: Omit<CachedGeo, 'at'> & { at?: number }): void {
  try {
    const payload: CachedGeo = {
      lat: geo.lat,
      lng: geo.lng,
      address: geo.address || `${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`,
      accuracy: geo.accuracy ?? null,
      at: geo.at ?? Date.now(),
    };
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

export function readMediaReadyMark(): MediaReadyMark | null {
  try {
    const raw = localStorage.getItem(MEDIA_READY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MediaReadyMark;
    if (!Number.isFinite(parsed?.at)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMediaReadyMark(mark: Omit<MediaReadyMark, 'at'> & { at?: number }): void {
  try {
    localStorage.setItem(
      MEDIA_READY_KEY,
      JSON.stringify({
        geoOk: !!mark.geoOk,
        cameraOk: !!mark.cameraOk,
        at: mark.at ?? Date.now(),
      } satisfies MediaReadyMark),
    );
  } catch {
    /* ignore */
  }
}

export function clearMediaReadyMark(): void {
  try {
    localStorage.removeItem(MEDIA_READY_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Whether we should show the explicit "Ativar câmera e GPS" gate.
 * Skip when both were already granted in this origin (or marked after a prior success).
 */
export async function shouldShowMediaPermissionGate(): Promise<boolean> {
  if (!isSecureMediaContext()) return true;
  const mark = readMediaReadyMark();
  if (mark?.geoOk && mark?.cameraOk) return false;

  const [geo, cam] = await Promise.all([
    queryGeolocationPermission(),
    queryCameraPermission(),
  ]);
  if (geo === 'granted' && (cam === 'granted' || cam === 'unknown')) return false;
  if (geo === 'denied' || cam === 'denied') return true;
  return true;
}
