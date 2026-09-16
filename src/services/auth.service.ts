import { supabase, isSupabaseConfigured } from './supabase';
import { User } from '../types';
import { organizationService } from './organization.service';
import { sessionManager } from './session/sessionManager';
import { apiClient } from './api.client';
import { isInternalAuthEmail } from '../utils/emailUtils';

// Build the app User object from a Supabase profile row
const profileToUser = (profile: Record<string, any>): User => ({
  id: profile.id,
  employeeId: profile.employee_id || '',
  email: profile.email || '',
  name: profile.name || 'User',
  role: (profile.role || 'EMPLOYEE').toString().toUpperCase() as any,
  department: profile.department || 'Unassigned',
  designation: profile.designation || 'Staff',
  teamId: profile.team_id || undefined,
  shiftId: profile.shift_id || undefined,
  organizationId: profile.organization_id || undefined,
  employmentType: (profile.employment_type || undefined) as User['employmentType'],
  allowPwaPunch: profile.allow_pwa_punch === true,
  avatar: profile.avatar
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/${profile.avatar}`
    : undefined,
});

/** Map Supabase/network errors to readable pt-BR messages for login UI. */
export function mapLoginError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('fetch') || m.includes('network') || m.includes('failed to load')) {
    return 'Não foi possível contactar o servidor da API. Confira a conexão (Wi‑Fi/4G), o endereço do app e se aparece "Banco conectado" no login.';
  }
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (m.includes('not verified') || m.includes('email not confirmed')) {
    return 'Conta ainda não ativada. Peça ao RH para salvar de novo o e-mail e a senha, ou use Primeiro acesso com o CPF.';
  }
  if (m.includes('redirect') && (m.includes('allow') || m.includes('whitelist') || m.includes('uri'))) {
    return 'Não foi possível enviar o link de redefinição neste endereço. Peça ao RH para definir a senha na ficha do colaborador.';
  }
  return message;
}

export const authService = {
  async login(email: string, pass: string): Promise<{ user: User | null; error?: string }> {
    if (!isSupabaseConfigured()) return { user: null, error: 'Supabase not configured.' };

    const normalizedEmail = email.trim().toLowerCase();
    if (isInternalAuthEmail(normalizedEmail)) {
      return {
        user: null,
        error: 'Este e-mail é técnico da importação e não serve para entrar. Use Primeiro acesso com o CPF, ou peça ao RH um e-mail real e uma senha.',
      };
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: pass,
    });

    if (authError || !authData.user) {
      return { user: null, error: mapLoginError(authError?.message || 'Login failed.') };
    }

    // Fetch profile row
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      return { user: null, error: 'Account profile not found. Contact support.' };
    }

    if (!profile.verified) {
      await supabase.auth.signOut();
      return {
        user: null,
        error: 'Conta ainda não ativada. Peça ao RH para salvar de novo o e-mail e a senha, ou use Primeiro acesso com o CPF.',
      };
    }

    const appUser = profileToUser({ ...profile, email: authData.user.email });
    apiClient.setOrganizationId(profile.organization_id);
    apiClient.setAuthRole(profile.role);
    return { user: appUser };
  },

  async logout() {
    await sessionManager.forceLogout('USER_INITIATED');
    await supabase.auth.signOut();
    organizationService.clearCache();
    apiClient.notify();
  },

  async finalizePasswordReset(_token: string, newPassword: string): Promise<boolean> {
    // Supabase handles token via magic link in URL — user lands back in app
    // already authenticated; we just update the password.
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { console.error('[Auth] Password reset failed:', error.message); return false; }
    return true;
  },

  async requestVerificationEmail(email: string): Promise<boolean> {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) { console.error('[Auth] Resend verification failed:', error.message); return false; }
    return true;
  },

  async requestPasswordReset(email: string): Promise<{ ok: boolean; error?: string }> {
    const normalized = email.trim().toLowerCase();
    if (isInternalAuthEmail(normalized)) {
      return {
        ok: false,
        error: 'Este e-mail é técnico da importação e não recebe mensagens. Peça ao RH para definir um e-mail real e a senha, ou use Primeiro acesso com o CPF.',
      };
    }
    const redirectCandidates = [
      `${window.location.origin}/?reset=1`,
      `${window.location.origin}/`,
      window.location.origin,
    ];
    let lastMessage = '';
    for (const redirectTo of redirectCandidates) {
      const { error } = await supabase.auth.resetPasswordForEmail(normalized, { redirectTo });
      if (!error) return { ok: true };
      lastMessage = error.message || '';
      if (!/redirect|whitelist|allow list|not allowed/i.test(lastMessage)) {
        break;
      }
    }
    const fallback = await supabase.auth.resetPasswordForEmail(normalized);
    if (!fallback.error) return { ok: true };
    return { ok: false, error: mapLoginError(fallback.error.message || lastMessage || 'Reset failed') };
  },

  async lookupFirstAccess(cpf: string): Promise<{
    ok: boolean;
    firstName?: string;
    code?: string;
    error?: string;
  }> {
    if (!isSupabaseConfigured()) return { ok: false, error: 'Supabase not configured.', code: 'OFFLINE' };
    const base = import.meta.env.VITE_SUPABASE_URL;
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!base || !anon) return { ok: false, error: 'Supabase not configured.', code: 'OFFLINE' };
    try {
      const res = await fetch(`${base}/functions/v1/claim-employee-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anon}`,
          apikey: anon,
        },
        body: JSON.stringify({ action: 'lookup', cpf }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, code: json.code, error: json.error || 'Lookup failed' };
      }
      return { ok: true, firstName: json.firstName };
    } catch (e: any) {
      return { ok: false, error: mapLoginError(e?.message || 'Lookup failed'), code: 'NETWORK' };
    }
  },

  async claimEmployeeAccess(input: {
    cpf: string;
    confirmFirstName: string;
    email: string;
    password: string;
  }): Promise<{ ok: boolean; email?: string; code?: string; error?: string }> {
    if (!isSupabaseConfigured()) return { ok: false, error: 'Supabase not configured.', code: 'OFFLINE' };
    const base = import.meta.env.VITE_SUPABASE_URL;
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!base || !anon) return { ok: false, error: 'Supabase not configured.', code: 'OFFLINE' };
    try {
      const res = await fetch(`${base}/functions/v1/claim-employee-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anon}`,
          apikey: anon,
        },
        body: JSON.stringify({ action: 'claim', ...input }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, code: json.code, error: json.error || 'Claim failed' };
      }
      return { ok: true, email: json.email || input.email };
    } catch (e: any) {
      return { ok: false, error: mapLoginError(e?.message || 'Claim failed'), code: 'NETWORK' };
    }
  },

  async registerOrganization(data: {
    orgName: string;
    adminName: string;
    email: string;
    password: string;
    country: string;
    address?: string;
    logo?: File | null;
  }): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured()) return { success: false, error: 'System offline' };

    try {
      const formData = new FormData();
      formData.append('orgName', data.orgName);
      formData.append('adminName', data.adminName);
      formData.append('email', data.email);
      formData.append('password', data.password);
      formData.append('country', data.country);
      if (data.address) formData.append('address', data.address);
      if (data.logo) formData.append('logo', data.logo);

      // Calls the Supabase Edge Function (Phase 4 will create this)
      const { data: result, error } = await supabase.functions.invoke('register', {
        body: formData,
      });

      // SECURITY: Clear password from memory immediately
      data.password = '';

      if (error) {
        let message = error.message;
        try {
          // FunctionsHttpError wraps the real body — extract it
          const body = await (error as any).context?.json?.();
          if (body?.message) message = body.message;
        } catch {}
        console.error('[Auth] Registration 400 body:', message);
        return { success: false, error: message };
      }
      if (result?.message && !result?.success) return { success: false, error: result.message };
      if (result?.error) return { success: false, error: result.error };

      return { success: true };
    } catch (err: any) {
      data.password = '';
      console.error('[Auth] Registration error');
      return { success: false, error: err?.message || 'Registration failed.' };
    }
  },

  // Fetch the current user's profile from Supabase (used by sessionManager shim)
  async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) return null;
    // Keep apiClient org ID warm for page-refresh case (login() not called)
    apiClient.setOrganizationId(profile.organization_id ?? undefined);
    apiClient.setAuthRole(profile.role ?? undefined);
    return profileToUser({ ...profile, email: user.email });
  },
};
