/**
 * Brazilian national + Rio Grande do Sul state holiday calendar.
 * Offline catalog (no external API). Movable dates via Easter Sunday (Gregorian).
 */

import { Holiday } from '../types';

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fixed(year: number, month: number, day: number): string {
  return toIsoDate(new Date(year, month - 1, day));
}

function holidayId(date: string, slug: string): string {
  return `br-rs-${date}-${slug}`;
}

export interface BrRsHolidayOptions {
  /** Include Carnival Mon/Tue + Corpus Christi (facultative, widely observed). Default true. */
  includeCommonFacultative?: boolean;
}

/**
 * National BR + RS (Data Magna 20/09) for a given year.
 * Does not include municipal holidays (e.g. Navegantes in Porto Alegre).
 */
export function getBrRsHolidaysForYear(
  year: number,
  options: BrRsHolidayOptions = {}
): Holiday[] {
  const includeFacultative = options.includeCommonFacultative !== false;
  const easter = easterSunday(year);
  const list: Holiday[] = [];

  const push = (
    date: string,
    name: string,
    type: Holiday['type'],
    isGovernment: boolean,
    slug: string
  ) => {
    list.push({
      id: holidayId(date, slug),
      date,
      name,
      type,
      isGovernment,
    });
  };

  // --- Feriados nacionais (lei federal) ---
  push(fixed(year, 1, 1), 'Confraternização Universal', 'NATIONAL', true, 'ano-novo');
  push(toIsoDate(addDays(easter, -2)), 'Paixão de Cristo', 'NATIONAL', true, 'sexta-santa');
  push(fixed(year, 4, 21), 'Tiradentes', 'NATIONAL', true, 'tiradentes');
  push(fixed(year, 5, 1), 'Dia do Trabalho', 'NATIONAL', true, 'trabalho');
  push(fixed(year, 9, 7), 'Independência do Brasil', 'NATIONAL', true, 'independencia');
  push(fixed(year, 10, 12), 'Nossa Senhora Aparecida', 'NATIONAL', true, 'aparecida');
  push(fixed(year, 11, 2), 'Finados', 'NATIONAL', true, 'finados');
  push(fixed(year, 11, 15), 'Proclamação da República', 'NATIONAL', true, 'republica');
  // Lei 14.759/2023 — feriado nacional
  push(fixed(year, 11, 20), 'Dia da Consciência Negra', 'NATIONAL', true, 'consciencia-negra');
  push(fixed(year, 12, 25), 'Natal', 'NATIONAL', true, 'natal');

  // --- Feriado estadual RS (Data Magna / Dia do Gaúcho) ---
  push(
    fixed(year, 9, 20),
    'Data Magna do Rio Grande do Sul',
    'STATE',
    true,
    'rs-data-magna'
  );

  // --- Facultativos comuns (não são feriados nacionais, mas calendário operacional) ---
  if (includeFacultative) {
    push(toIsoDate(addDays(easter, -48)), 'Carnaval (segunda-feira)', 'FESTIVAL', false, 'carnaval-seg');
    push(toIsoDate(addDays(easter, -47)), 'Carnaval (terça-feira)', 'FESTIVAL', false, 'carnaval-ter');
    push(toIsoDate(addDays(easter, 60)), 'Corpus Christi', 'FESTIVAL', false, 'corpus-christi');
  }

  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Merge imported holidays into existing list; skip dates already present. */
export function mergeHolidaysByDate(
  existing: Holiday[],
  incoming: Holiday[]
): { merged: Holiday[]; added: number; skipped: number } {
  const byDate = new Map<string, Holiday>();
  for (const h of existing) {
    if (h.date) byDate.set(h.date, h);
  }
  let added = 0;
  let skipped = 0;
  for (const h of incoming) {
    if (byDate.has(h.date)) {
      skipped += 1;
      continue;
    }
    byDate.set(h.date, h);
    added += 1;
  }
  const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { merged, added, skipped };
}
