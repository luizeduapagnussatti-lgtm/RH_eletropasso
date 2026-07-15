import i18n from './index';

type Domain = 'leave' | 'attendance' | 'review' | 'subscription' | 'role' | 'priority' | 'notification';

/**
 * Translate a machine status/role code for UI display.
 * Falls back to a humanized code if the key is missing.
 */
export function tStatus(domain: Domain, code: string | undefined | null): string {
  if (!code) return '';
  const key = `status:${domain}.${code}`;
  if (i18n.exists(key)) return i18n.t(key);
  return code.replace(/_/g, ' ');
}

export function tRole(role: string | undefined | null): string {
  return tStatus('role', role);
}
