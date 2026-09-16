/** Auth-only addresses that are not real inboxes (Supabase login / DMPREP import). */
const INTERNAL_AUTH_EMAIL_SUFFIXES = [
  '@eletropasso.loja',
  '@import.eletropasso.local',
  '@inactive.eletropasso.local',
];

export function isInternalAuthEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return INTERNAL_AUTH_EMAIL_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

const LOGIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when the address can be used as a real login (not import/inactive placeholders). */
export function isUsableLoginEmail(email: string | null | undefined): boolean {
  const value = String(email || '').trim().toLowerCase();
  return LOGIN_EMAIL_RE.test(value) && !isInternalAuthEmail(value);
}

/** Staff cannot set a password while the login is still a technical import address. */
export function staffPasswordRequiresRealEmail(loginEmail: string | null | undefined, password: string | null | undefined): boolean {
  if (!String(password || '').trim()) return false;
  const email = String(loginEmail || '').trim();
  if (!email) return false;
  return !isUsableLoginEmail(email);
}

/** Prefill contact reply field only when the user has a real mailbox. */
export function getContactReplyEmailPrefill(email: string | null | undefined): string {
  if (!email || isInternalAuthEmail(email)) return '';
  return email.trim();
}
