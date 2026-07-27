export function pisLookupKeys(value: string | null | undefined): string[] {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return [];
  const keys = new Set([digits, digits.padStart(11, '0'), digits.padStart(12, '0')]);
  if (digits.length === 12 && digits.startsWith('0')) keys.add(digits.slice(1));
  if (digits.length === 11) keys.add(`0${digits}`);
  // Short Matrícula variants (strip leading zeros for 1–4 digit IDs)
  const trimmed = digits.replace(/^0+/, '') || '0';
  keys.add(trimmed);
  keys.add(trimmed.padStart(12, '0'));
  return [...keys];
}

export function employeeIdFromPis(pis: string | null | undefined): string {
  const digits = String(pis ?? '').replace(/\D/g, '');
  return digits ? digits.padStart(12, '0') : '';
}

/** Credencial/Matrícula from DIMEP — may be short; store as 12 zero-padded. */
export function clockCredentialFromValue(value: string | null | undefined): string {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length > 12) digits = digits.slice(-12);
  return digits.padStart(12, '0');
}

export function importEmailFromPis(pis12: string): string {
  return `rep.${pis12}@import.eletropasso.local`;
}
