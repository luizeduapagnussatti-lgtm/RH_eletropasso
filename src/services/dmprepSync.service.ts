import { supabase, isSupabaseConfigured } from './supabase';

const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

export type DmprepSyncScope = 'all' | 'punches' | 'employees';

export interface DmprepEmployeeImportSummary {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  total: number;
}

export interface DmprepPunchSyncSummary {
  scannedLines: number;
  newRecords: number;
  inserted: number;
  duplicates: number;
  skipped: boolean;
  resetCursor: boolean;
}

export interface DmprepSyncResponse {
  success?: boolean;
  scope?: DmprepSyncScope;
  busy?: boolean;
  error?: string;
  employees?: DmprepEmployeeImportSummary;
  punches?: DmprepPunchSyncSummary;
}

export const dmprepSyncService = {
  async triggerSync(scope: DmprepSyncScope = 'all'): Promise<DmprepSyncResponse> {
    if (!isSupabaseConfigured() || !SUPABASE_FUNCTIONS_URL) {
      throw new Error('Supabase is not configured');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }

    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/dmprep-sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope }),
    });

    const json = (await res.json()) as DmprepSyncResponse & { message?: string };
    if (!res.ok) {
      throw new Error(json.error || json.message || 'DMPREP sync failed');
    }
    return json;
  },
};
