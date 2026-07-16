import { createClient, SupabaseClient, Session, User as SupabaseUser } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const isSupabaseConfigured = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Checks whether the Supabase Auth service is reachable without requiring a user session. */
export const checkSupabaseConnection = async (timeoutMs = 5000): Promise<boolean> => {
  if (!isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const getSupabaseStorageUrl = (bucket: string, path: string): string =>
  `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

export const getSupabaseSignedUrl = async (bucket: string, path: string, expiresIn = 3600): Promise<string | null> => {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) { console.error('[Supabase Storage] Signed URL error:', error.message); return null; }
  return data.signedUrl;
};

export type { Session, SupabaseUser };
