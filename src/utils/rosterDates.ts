function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function saturdaysInMonth(year: number, month: number): string[] {
  const out: string[] = [];
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() === 6) out.push(toIso(year, month, d));
  }
  return out;
}
