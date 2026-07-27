/** Auth-only addresses that are not real inboxes (Supabase login / DMPREP import). */
const INTERNAL_AUTH_EMAIL_SUFFIXES = ['@eletropasso.loja', '@import.eletropasso.local'];

export function isInternalAuthEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return INTERNAL_AUTH_EMAIL_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/** Prefill contact reply field only when the user has a real mailbox. */
export function getContactReplyEmailPrefill(email: string | null | undefined): string {
  if (!email || isInternalAuthEmail(email)) return '';
  return email.trim();
}
