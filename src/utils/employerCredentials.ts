/** Brazilian CNPJ — 14 digits with check digits. */

export function normalizeCnpj(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function validateCnpj(value: string | null | undefined): { ok: boolean; error?: string } {
  const cnpj = normalizeCnpj(value);
  if (!cnpj) return { ok: false, error: 'cnpj_required' };
  if (cnpj.length !== 14) return { ok: false, error: 'cnpj_length' };
  if (/^(\d)\1{13}$/.test(cnpj)) return { ok: false, error: 'cnpj_invalid' };

  const calcDigit = (base: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += parseInt(base[i], 10) * weights[i];
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(cnpj, w1);
  if (d1 !== parseInt(cnpj[12], 10)) return { ok: false, error: 'cnpj_invalid' };
  const d2 = calcDigit(cnpj, w2);
  if (d2 !== parseInt(cnpj[13], 10)) return { ok: false, error: 'cnpj_invalid' };

  return { ok: true };
}

export function formatCnpjDisplay(value: string | null | undefined): string {
  const d = normalizeCnpj(value);
  if (d.length !== 14) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export type EsocialAmbiente = 'PRODUCAO' | 'PRODUCAO_RESTRITA';
