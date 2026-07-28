import { APP_NAME, BRAND_RED, CHROME_BG, PDF_LOGO_PATH, STORE_LOGO_FALLBACK, STORE_LOGO_PATH } from '../config/branding';
import { formatIsoDateBr, getDateLocale } from '../i18n/format';
/** Eletropasso PDF design tokens — mirror DESIGN.md (chrome + brand red + slate ink). */
export const PDF_COLORS = {
  chrome: [24, 34, 48] as [number, number, number],
  brandRed: [196, 30, 36] as [number, number, number],
  ink: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  surfaceAlt: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  present: [5, 150, 105] as [number, number, number],
  absent: [220, 38, 38] as [number, number, number],
  late: [217, 119, 6] as [number, number, number],
  leave: [37, 99, 235] as [number, number, number],
};

export const PDF_MARGIN = 14;

export const SUMMARY_TABLE_HEAD_STYLES = {
  fillColor: PDF_COLORS.chrome,
  textColor: PDF_COLORS.white,
  fontStyle: 'bold' as const,
  fontSize: 7.5,
  cellPadding: 2.5,
};

export const SUMMARY_TABLE_BODY_STYLES = {
  fontSize: 7.5,
  textColor: PDF_COLORS.ink,
  cellPadding: 2.2,
};

export const STANDARD_TABLE_STYLES = {
  theme: 'grid' as const,
  headStyles: SUMMARY_TABLE_HEAD_STYLES,
  bodyStyles: SUMMARY_TABLE_BODY_STYLES,
  alternateRowStyles: { fillColor: PDF_COLORS.surfaceAlt },
  margin: { left: PDF_MARGIN, right: PDF_MARGIN },
  styles: { overflow: 'linebreak' as const, lineColor: PDF_COLORS.border, lineWidth: 0.15 },
};

export type PdfOrgInfo = {
  name: string;
  address: string;
  logoDataUrl: string | null;
};

export type PdfMetric = {
  label: string;
  value: string | number;
  tone?: 'present' | 'absent' | 'late' | 'leave' | 'neutral';
};

export type PdfFormRow = { label: string; value: string };

export type PdfSignatureSlot = { label: string; name: string };

export type JsPdfDoc = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number }; getNumberOfPages: () => number };
  setPage: (n: number) => void;
  addPage: () => void;
  setFillColor: (...c: number[]) => void;
  setDrawColor: (...c: number[]) => void;
  setTextColor: (...c: number[]) => void;
  setFont: (family: string, style: string) => void;
  setFontSize: (size: number) => void;
  setLineWidth: (w: number) => void;
  text: (text: string, x: number, y: number, opts?: { align?: 'left' | 'center' | 'right' }) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  roundedRect?: (x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => void;
  splitTextToSize: (text: string, maxWidth: number) => string[];
  save: (filename: string) => void;
  output: (type: 'blob' | 'arraybuffer' | 'datauristring') => Blob | ArrayBuffer | string;
  autoTable?: (opts: Record<string, unknown>) => void;
  lastAutoTable?: { finalY: number };
};

const toneColor = (tone: PdfMetric['tone']): [number, number, number] => {
  switch (tone) {
    case 'present': return PDF_COLORS.present;
    case 'absent': return PDF_COLORS.absent;
    case 'late': return PDF_COLORS.late;
    case 'leave': return PDF_COLORS.leave;
    default: return PDF_COLORS.ink;
  }
};

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function getScaledLogoDims(dataUrl: string, maxSize: number): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight);
      resolve({ w: img.naturalWidth * ratio, h: img.naturalHeight * ratio });
    };
    img.onerror = () => resolve({ w: maxSize, h: maxSize });
    img.src = dataUrl;
  });
}

let cachedBrandLogoPng: string | null = null;

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Rasterize to PNG so jsPDF gets alpha (transparent wordmark, no white box). */
export async function dataUrlToPngForPdf(dataUrl: string): Promise<{ dataUrl: string; format: 'PNG' }> {
  if (dataUrl.startsWith('data:image/png')) {
    return { dataUrl, format: 'PNG' };
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL('image/png'), format: 'PNG' });
    };
    img.onerror = () => reject(new Error('Logo image failed to load'));
    img.src = dataUrl;
  });
}

/** Eletropasso print wordmark (black PASSO) — used on all PDF exports. */
export async function loadTransparentBrandLogo(): Promise<string | null> {
  if (cachedBrandLogoPng) return cachedBrandLogoPng;
  // Prefer dark-letter print asset; UI logos keep light PASSO for dark chrome.
  const candidates = [PDF_LOGO_PATH, STORE_LOGO_PATH, STORE_LOGO_FALLBACK, '/img/logo-eletropasso-source.png'];
  for (const path of candidates) {
    try {
      const resp = await fetch(path);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      const raw = await blobToDataUrl(blob);
      const { dataUrl } = await dataUrlToPngForPdf(raw);
      cachedBrandLogoPng = dataUrl;
      return dataUrl;
    } catch {
      /* try next asset */
    }
  }
  return null;
}

/** Prefer transparent Eletropasso wordmark; keep org name/address from tenant. */
export async function resolvePdfOrgBranding(org: PdfOrgInfo): Promise<PdfOrgInfo> {
  const brandLogo = await loadTransparentBrandLogo();
  if (!brandLogo) return org;
  return { ...org, logoDataUrl: brandLogo };
}
export async function loadPdfLibs(): Promise<{ jsPDF: new (opts?: object) => JsPdfDoc }> {
  const jsPDFModule = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const jsPDF = (jsPDFModule.default || jsPDFModule.jsPDF) as new (opts?: object) => JsPdfDoc;
  if (autoTableModule.applyPlugin) autoTableModule.applyPlugin(jsPDF as never);
  return { jsPDF };
}

export function createPdfDocument(orientation: 'portrait' | 'landscape' = 'portrait'): Promise<JsPdfDoc> {
  return loadPdfLibs().then(({ jsPDF }) => new jsPDF({ orientation, unit: 'mm', format: 'a4' }));
}

/**
 * Branded document header: chrome bar + brand-red accent + org block + title.
 * Returns Y position after the header for content start.
 */
export async function drawReportHeader(
  doc: JsPdfDoc,
  opts: {
    org: PdfOrgInfo;
    title: string;
    subtitle: string;
    getScaledLogoDims?: (dataUrl: string, maxSize: number) => Promise<{ w: number; h: number }>;
  }
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_MARGIN;
  const scaleLogo = opts.getScaledLogoDims || getScaledLogoDims;
  const org = await resolvePdfOrgBranding(opts.org);

  doc.setFillColor(...PDF_COLORS.chrome);
  doc.rect(0, 0, pageWidth, 8, 'F');
  doc.setFillColor(...PDF_COLORS.brandRed);
  doc.rect(0, 8, pageWidth, 1.2, 'F');

  let cursorY = 18;
  const logoSize = 18;
  let textStartX = margin;

  if (org.logoDataUrl) {
    try {
      const { dataUrl, format } = await dataUrlToPngForPdf(org.logoDataUrl);
      const logoDims = await scaleLogo(dataUrl, logoSize);
      doc.addImage(dataUrl, format, margin, cursorY - 4, logoDims.w, logoDims.h);
      textStartX = margin + logoDims.w + 5;
    } catch { /* skip logo */ }
  }

  if (org.name) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(org.name, textStartX, cursorY + 2);
  }
  if (org.address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(org.address, textStartX, cursorY + 8);
  }

  cursorY += Math.max(logoSize, 12) + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(opts.title, margin, cursorY);
  cursorY += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(opts.subtitle, margin, cursorY);
  cursorY += 7;

  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 6;

  return cursorY;
}

/** Centered document title for form-style PDFs (leave, review). */
export function drawDocumentTitle(
  doc: JsPdfDoc,
  y: number,
  title: string,
  subtitle?: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const cx = pageWidth / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(title, cx, y, { align: 'center' });
  let ny = y + 7;

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(subtitle, cx, ny, { align: 'center' });
    ny += 6;
  }
  return ny + 4;
}

/** Label/value section — flat tinted header, no side-stripe accents. */
export function drawFormSection(
  doc: JsPdfDoc,
  y: number,
  title: string,
  rows: PdfFormRow[],
  onPageBreak?: (neededMm: number) => void
): number {
  const margin = PDF_MARGIN;
  const pageWidth = doc.internal.pageSize.getWidth();
  const labelX = margin + 3;
  const valueX = margin + 52;
  const valueWidth = pageWidth - valueX - margin;

  onPageBreak?.(12 + rows.length * 6);

  doc.setFillColor(...PDF_COLORS.surfaceAlt);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.2);
  doc.rect(margin, y, pageWidth - margin * 2, 7, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(title, labelX, y + 5);
  y += 10;

  rows.forEach(({ label, value }) => {
    onPageBreak?.(8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(`${label}:`, labelX, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.ink);
    const lines = doc.splitTextToSize(value || '—', valueWidth);
    doc.text(lines, valueX, y);
    y += Math.max(lines.length * 4.2, 5) + 1.5;
  });

  return y + 4;
}

export function createPageBreakChecker(doc: JsPdfDoc, getY: () => number, setY: (y: number) => void) {
  const pageHeight = doc.internal.pageSize.getHeight();
  return (needed: number) => {
    if (getY() + needed > pageHeight - PDF_MARGIN) {
      doc.addPage();
      setY(22);
    }
  };
}

/** Dual signature lines for employee / manager acknowledgment. */
export function drawSignatureBlock(doc: JsPdfDoc, y: number, slots: PdfSignatureSlot[]): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_MARGIN;
  const gap = 16;
  const slotW = (pageWidth - margin * 2 - gap * (slots.length - 1)) / slots.length;

  slots.forEach((slot, i) => {
    const x1 = margin + i * (slotW + gap);
    const x2 = x1 + slotW;
    doc.setDrawColor(...PDF_COLORS.ink);
    doc.setLineWidth(0.25);
    doc.line(x1, y, x2, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(slot.label, x1, y + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.ink);
    const nameLines = doc.splitTextToSize(slot.name || '—', slotW);
    doc.text(nameLines, x1, y + 9);
  });

  return y + 18;
}

/** Compact metric strip for report summaries. */
export function drawMetricStrip(
  doc: JsPdfDoc,
  startY: number,
  metrics: PdfMetric[],
  sectionLabel?: string
): number {
  const margin = PDF_MARGIN;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = startY;

  if (sectionLabel) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(sectionLabel, margin, y);
    y += 5;
  }

  const gap = 3;
  const usable = pageWidth - margin * 2;
  const boxW = (usable - gap * (metrics.length - 1)) / metrics.length;
  const boxH = 14;

  metrics.forEach((m, i) => {
    const x = margin + i * (boxW + gap);
    doc.setFillColor(...PDF_COLORS.surfaceAlt);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.2);
    if (typeof doc.roundedRect === 'function') {
      doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, 'FD');
    } else {
      doc.rect(x, y, boxW, boxH, 'FD');
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(m.label.toUpperCase(), x + 3, y + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...toneColor(m.tone));
    doc.text(String(m.value), x + 3, y + 11);
  });

  return y + boxH + 6;
}

export function applyStandardTable(doc: JsPdfDoc, opts: Record<string, unknown>): void {
  doc.autoTable?.({
    ...STANDARD_TABLE_STYLES,
    ...opts,
  });
}

export function drawReportFooters(
  doc: JsPdfDoc,
  generatedLabel: string,
  pageLabel: (current: number, total: number) => string
): void {
  const totalPages = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = PDF_MARGIN;

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(generatedLabel, margin, pageHeight - 7);
    doc.text(pageLabel(i, totalPages), pageWidth - margin, pageHeight - 7, { align: 'right' });

    doc.setFillColor(...PDF_COLORS.brandRed);
    doc.rect(pageWidth / 2 - 4, pageHeight - 9.5, 8, 1, 'F');
  }
}

export function formatReportPeriod(startIso: string, endIso: string): string {
  const sep = getDateLocale().startsWith('pt') ? ' a ' : ' to ';
  return `${formatIsoDateBr(startIso)}${sep}${formatIsoDateBr(endIso)}`;
}

export function formatGeneratedAt(): string {
  return new Date().toLocaleString(getDateLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export { APP_NAME, BRAND_RED, CHROME_BG };
