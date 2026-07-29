/** Normalize Brazilian mobile/phone to E.164 digits (no +), e.g. 5548981159982 */
export function normalizePhoneE164BR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

/** Evolution API expects digits only (no @ suffix in v2 sendText number field). */
export function formatWhatsAppNumber(e164: string): string {
  return e164.replace(/\D/g, '');
}

export function isValidBrazilMobileE164(e164: string | null | undefined): boolean {
  if (!e164) return false;
  const d = e164.replace(/\D/g, '');
  return /^55[1-9][0-9][9][0-9]{8}$/.test(d) || /^55[1-9][0-9][0-9]{8}$/.test(d);
}

export function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return '';
  const d = e164.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) {
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith('55')) {
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return e164;
}
