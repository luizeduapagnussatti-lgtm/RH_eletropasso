/** PIS (NIS) — 11–12 digits, stored as 12 with leading zeros. Folha / eSocial. */

export function normalizePis(value: string | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(12, '0');
}

export function validatePis(value: string | null | undefined): { ok: boolean; error?: string } {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return { ok: false, error: 'pis_required' };
  if (digits.length < 11 || digits.length > 12) return { ok: false, error: 'pis_length' };
  if (!/^\d+$/.test(digits)) return { ok: false, error: 'pis_digits' };
  return { ok: true };
}

export function formatPisDisplay(value: string | null | undefined): string {
  const n = normalizePis(value);
  return n || '';
}

/**
 * PrintPoint / DMP REP Credencial (Matrícula) — 1–12 significant digits,
 * stored as 12 with leading zeros (MOVIMENT field width).
 * May differ from PIS for legacy enrollments.
 */
export function normalizeClockCredential(value: string | null | undefined): string {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length > 12) digits = digits.slice(-12);
  return digits.padStart(12, '0');
}

export function validateClockCredential(
  value: string | null | undefined
): { ok: boolean; error?: string } {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: true };
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { ok: false, error: 'credential_length' };
  const significant = digits.replace(/^0+/, '') || '0';
  if (significant.length > 12) return { ok: false, error: 'credential_length' };
  return { ok: true };
}

/** Prefer explicit clock credential; fall back to PIS for legacy rows only. */
export function resolveClockCredential(
  clockCredential?: string | null,
  pis?: string | null
): string {
  return normalizeClockCredential(clockCredential) || normalizePis(pis);
}

/**
 * DIMEP Codigo / PrintPoint keypad IDs are short (1–6 significant digits).
 * 11–12 digit values are treated as PIS leftovers and ignored when allocating.
 */
export const SHORT_CLOCK_CREDENTIAL_MAX_DIGITS = 6;

export function clockCredentialSignificantDigits(
  value: string | null | undefined
): string {
  const n = normalizeClockCredential(value);
  if (!n) return '';
  return n.replace(/^0+/, '') || '0';
}

export function isShortClockCredential(value: string | null | undefined): boolean {
  const sig = clockCredentialSignificantDigits(value);
  return !!sig && sig.length <= SHORT_CLOCK_CREDENTIAL_MAX_DIGITS;
}

/**
 * Next PrintPoint credential for an org: max(short IDs) + 1 across ALL rows
 * (active and inactive). Credentials must never be cleared on discharge —
 * otherwise MAX+1 reuses old badge numbers and the physical clock shows the
 * previous person's name.
 * Ignores PIS-like 11–12 digit values so a legacy fallback cannot jump the sequence.
 */
export function allocateNextClockCredential(
  existing: Array<string | null | undefined>
): string {
  const used = new Set<string>();
  let max = 0;
  for (const raw of existing) {
    const normalized = normalizeClockCredential(raw);
    if (!normalized) continue;
    used.add(normalized);
    if (!isShortClockCredential(normalized)) continue;
    const n = parseInt(clockCredentialSignificantDigits(normalized), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  let next = max + 1;
  let padded = normalizeClockCredential(String(next));
  while (used.has(padded)) {
    next += 1;
    padded = normalizeClockCredential(String(next));
  }
  return padded;
}

export function formatClockCredentialDisplay(value: string | null | undefined): string {
  const n = normalizeClockCredential(value);
  if (!n) return '';
  const trimmed = n.replace(/^0+/, '') || '0';
  return trimmed.length <= 4 ? trimmed : n;
}

/** Payload for WatchComm AddEmployee: 12-digit PIS + short keypad credential. */
export function toWatchCommSendEmployee(input: {
  name: string;
  employeeId?: string | null;
  clockCredential?: string | null;
}): { pis: string; name: string; credential: string } | null {
  const pis = normalizePis(input.employeeId);
  if (!pis) return null;
  const credential =
    clockCredentialSignificantDigits(input.clockCredential) ||
    clockCredentialSignificantDigits(pis);
  return {
    pis,
    name: String(input.name || '').trim(),
    credential,
  };
}

/** Brazilian CPF check digits (optional field). */
export function normalizeCpf(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function validateCpf(value: string | null | undefined): { ok: boolean; error?: string } {
  const cpf = normalizeCpf(value);
  if (!cpf) return { ok: true };
  if (cpf.length !== 11) return { ok: false, error: 'cpf_length' };
  if (/^(\d)\1{10}$/.test(cpf)) return { ok: false, error: 'cpf_invalid' };

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return { ok: false, error: 'cpf_invalid' };

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  if (d2 !== parseInt(cpf[10], 10)) return { ok: false, error: 'cpf_invalid' };

  return { ok: true };
}

export function formatCpfDisplay(value: string | null | undefined): string {
  const d = normalizeCpf(value);
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
