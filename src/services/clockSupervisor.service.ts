import type { ClockSupervisor, ClockSupervisorCommand, ClockSupervisorInput } from '../types';
import { isSupabaseConfigured, supabase } from './supabase';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

async function request<T>(method: string, input?: ClockSupervisorInput, id?: string): Promise<T> {
  if (!isSupabaseConfigured() || !FUNCTIONS_URL) {
    throw new Error('Supabase is not configured');
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const query = id ? `?id=${encodeURIComponent(id)}` : '';
  const response = await fetch(`${FUNCTIONS_URL}/clock-supervisors${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Clock supervisor operation failed');
  return payload;
}

export const clockSupervisorService = {
  async getOverview(): Promise<{ supervisors: ClockSupervisor[]; commands: ClockSupervisorCommand[] }> {
    return request<{ supervisors: ClockSupervisor[]; commands: ClockSupervisorCommand[] }>('GET');
  },

  async list(): Promise<ClockSupervisor[]> {
    const result = await request<{ supervisors: ClockSupervisor[] }>('GET');
    return result.supervisors;
  },

  async create(input: ClockSupervisorInput): Promise<ClockSupervisor> {
    const result = await request<{ supervisor: ClockSupervisor }>('POST', input);
    return result.supervisor;
  },

  async update(input: ClockSupervisorInput): Promise<ClockSupervisor> {
    const result = await request<{ supervisor: ClockSupervisor }>('PUT', input);
    return result.supervisor;
  },

  async remove(id: string): Promise<void> {
    await request<{ success: boolean }>('DELETE', undefined, id);
  },
};
