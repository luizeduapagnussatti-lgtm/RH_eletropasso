import i18n from './index';

/** Locale tag used by Intl / toLocaleString (pt-BR or en-US). */
export function getDateLocale(): string {
  return i18n.language?.startsWith('pt') ? 'pt-BR' : 'en-US';
}

export function formatDate(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(getDateLocale(), options ?? { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatTime(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString(getDateLocale(), options ?? { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(getDateLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getDateLocale(), options).format(value);
}
