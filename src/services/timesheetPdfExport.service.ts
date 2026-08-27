import { pairPunchesToSlots, groupPunchesByDate, punchService } from './punch.service';
import { organizationService } from './organization.service';
import { formatIsoDateBr, formatTime, getDateLocale } from '../i18n/format';
import { formatCpfDisplay, formatPisDisplay } from '../utils/employeeCredentials';
import { displayAbsenceMinutes } from '../utils/timesheetDisplay';
import { canExportMirrorPdf } from '../utils/timesheetDayAckValidation';
import { minutesToDisplay } from '../utils/durationHm';
import { APP_NAME } from '../config/branding';
import {
  applyStandardTable,
  createPdfDocument,
  drawMetricStrip,
  drawReportFooters,
  drawReportHeader,
  drawFormSection,
  drawSignatureBlock,
  formatGeneratedAt,
  PdfOrgInfo,
} from '../utils/reportPdf';
import {
  Employee,
  Punch,
  TimesheetDay,
  TimesheetEmployeeReview,
  TimesheetPeriod,
} from '../types';

export type TimesheetPdfLabels = {
  title: string;
  periodRange: string;
  employeeSection: string;
  name: string;
  employeeId: string;
  cpf: string;
  department: string;
  designation: string;
  reviewStatus: string;
  reviewApproved: string;
  reviewPending: string;
  reviewPartial?: string;
  managerAckSummary?: string;
  metricsSection?: string;
  periodStatus?: string;
  colDay: string;
  colEntry1: string;
  colExit1: string;
  colEntry2: string;
  colExit2: string;
  colWorked: string;
  colOvertime: string;
  /** @deprecated Not shown on PDF (accounting prefers absence only). Kept optional for callers. */
  colLate?: string;
  colAbsence: string;
  colStatus: string;
  colEmployee: string;
  metricExpected?: string;
  metricWorked: string;
  metricOvertime: string;
  /** @deprecated Not shown on PDF. Kept optional for callers. */
  metricLate?: string;
  metricAbsence: string;
  summarySection: string;
  generatedBy: string;
  page: string;
  notAvailable: string;
  notesSection: string;
  extraPunchesLine: string;
  remarksLine: string;
  signatureEmployee: string;
  signatureManager: string;
  totalsRow: string;
  /** Legend for rows marked with * (manual punch adjustment). */
  adjustedDayLegend?: string;
};

/** Portrait A4 usable width (~182mm) - 9-column mirror (no late/atraso). */
const MIRROR_TABLE_COLUMN_STYLES: Record<number, { cellWidth?: number; halign?: 'center' | 'left' | 'right' }> = {
  0: { cellWidth: 28 },
  1: { cellWidth: 18 },
  2: { cellWidth: 18 },
  3: { cellWidth: 18 },
  4: { cellWidth: 18 },
  5: { cellWidth: 18, halign: 'center' },
  6: { cellWidth: 14, halign: 'center' },
  7: { cellWidth: 18, halign: 'center' },
  8: { cellWidth: 24 },
};

/** Strip English sentinel fallbacks from employee.service / session mapping. */
const EMPTY_FIELD_SENTINELS = new Set([
  '',
  'unassigned',
  'não atribuído',
  'nao atribuido',
  'staff',
  'no name',
  'n/a',
  'n/d',
]);

function displayField(value: string | undefined | null, fallback: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return fallback;
  if (EMPTY_FIELD_SENTINELS.has(trimmed.toLowerCase())) return fallback;
  return trimmed;
}

function slotTime(iso?: string): string {
  if (!iso) return '—';
  return formatTime(iso, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  });
}

function daysInPeriod(days: TimesheetDay[], period: TimesheetPeriod): TimesheetDay[] {
  return days.filter(d => d.workDate >= period.startDate && d.workDate <= period.endDate);
}

function formatDayCell(workDate: string): string {
  const d = new Date(`${workDate}T12:00:00`);
  const weekday = d.toLocaleDateString(getDateLocale(), { weekday: 'short' });
  const wd = weekday.replace(/\.$/, '');
  const cap = wd.charAt(0).toUpperCase() + wd.slice(1);
  return `${formatIsoDateBr(workDate)} ${cap}`;
}

function dayRemarkText(day: TimesheetDay): string {
  if (day.remarks?.trim()) return day.remarks.trim();
  const adj = day.manualAdjustment;
  if (adj && typeof adj === 'object') {
    for (const key of ['remarks', 'reason', 'note', 'motivo'] as const) {
      const v = adj[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return '';
}

function resolveReview(
  reviews: TimesheetEmployeeReview[],
  employee: Employee
): TimesheetEmployeeReview | null {
  const punchKey = employee.employeeId || employee.id;
  return (
    reviews.find(r => r.employeeId === punchKey) ||
    reviews.find(r => r.profileId === employee.id) ||
    reviews.find(r => r.employeeId === employee.id) ||
    null
  );
}

function daysForEmployee(allDays: TimesheetDay[], employee: Employee): TimesheetDay[] {
  const punchKey = employee.employeeId || employee.id;
  return allDays
    .filter(
      d =>
        d.employeeId === punchKey ||
        d.employeeId === employee.id ||
        d.employeeId === employee.employeeId
    )
    .sort((a, b) => a.workDate.localeCompare(b.workDate));
}

/** Match punches by profile id and/or PIS (same dual-key rule as Timesheet adjust UI). */
function punchesForEmployee(all: Punch[], employee: Employee): Punch[] {
  const keys = new Set(
    [employee.id, employee.employeeId].filter((k): k is string => !!k && k.trim() !== ''),
  );
  if (keys.size === 0) return [];
  return all.filter(p => keys.has(p.employeeId));
}

function dayHadPunchAdjustment(day: TimesheetDay, dayPunches: Punch[]): boolean {
  if (day.status === 'ADJUSTED') return true;
  if (day.remarks?.trim()) return true;
  return dayPunches.some(
    p =>
      (p.source === 'MANUAL' && !p.ignoredForCalc) ||
      p.ignoreSource === 'MANUAL',
  );
}

export type PdfActingUser = { id: string; name?: string };

function employeeNameById(employees: Employee[], userId: string): string | undefined {
  const hit = employees.find(e => e.id === userId);
  const name = hit?.name?.trim();
  return name || undefined;
}

/**
 * Gestor/RH on the PDF signature line: most recent punch editor in the period,
 * else whoever is exporting (logged-in user), else cadastral line manager.
 */
export function resolvePdfManagerName(opts: {
  periodDays: TimesheetDay[];
  punches: Punch[];
  employees: Employee[];
  review: TimesheetEmployeeReview | null;
  exportedBy?: PdfActingUser;
  lineManagerName?: string;
}): string {
  const candidates: { userId: string; at: string }[] = [];

  for (const p of opts.punches) {
    const raw = p.rawPayload;
    if (p.source === 'MANUAL' && raw && typeof raw === 'object') {
      const createdBy = (raw as Record<string, unknown>).createdBy;
      if (typeof createdBy === 'string' && createdBy.trim()) {
        candidates.push({ userId: createdBy.trim(), at: p.punchedAt });
      }
    }
    if (p.ignoredBy?.trim() && p.ignoreSource === 'MANUAL') {
      candidates.push({
        userId: p.ignoredBy.trim(),
        at: p.ignoredAt || p.punchedAt,
      });
    }
  }

  for (const day of opts.periodDays) {
    const adj = day.manualAdjustment;
    if (adj && typeof adj === 'object') {
      const editedBy = (adj as Record<string, unknown>).editedBy;
      const editedAt = (adj as Record<string, unknown>).editedAt;
      if (typeof editedBy === 'string' && editedBy.trim()) {
        candidates.push({
          userId: editedBy.trim(),
          at: typeof editedAt === 'string' ? editedAt : `${day.workDate}T23:59:59`,
        });
      }
    }
  }

  if (opts.review?.approvedBy?.trim()) {
    candidates.push({
      userId: opts.review.approvedBy.trim(),
      at: opts.review.approvedAt || '',
    });
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.at.localeCompare(a.at));
    for (const c of candidates) {
      const name = employeeNameById(opts.employees, c.userId);
      if (name) return name;
    }
  }

  if (opts.exportedBy?.name?.trim()) return opts.exportedBy.name.trim();
  if (opts.exportedBy?.id) {
    const name = employeeNameById(opts.employees, opts.exportedBy.id);
    if (name) return name;
  }

  return opts.lineManagerName?.trim() || '';
}

/**
 * Load period punches per employee (avoids org-wide listPunches 5000 cap that
 * drops MANUAL rows from the combined "Todos" PDF).
 */
async function loadPunchesForEmployees(
  employees: Employee[],
  startDate: string,
  endDate: string,
): Promise<Punch[]> {
  const punchKeys = [
    ...new Set(
      employees
        .flatMap(e => [e.employeeId, e.id])
        .filter((k): k is string => !!k && k.trim() !== ''),
    ),
  ];
  const CHUNK = 8;
  const byId = new Map<string, Punch>();
  for (let i = 0; i < punchKeys.length; i += CHUNK) {
    const chunk = punchKeys.slice(i, i + CHUNK);
    const lists = await Promise.all(
      chunk.map(employeeId =>
        punchService.listPunches({ employeeId, startDate, endDate }),
      ),
    );
    for (const list of lists) {
      for (const p of list) {
        if (!byId.has(p.id)) byId.set(p.id, p);
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));
}

/** Active staff for the combined "Todos" PDF — terminated accounts stay out.
 * When the caller already passed a filtered list (e.g. histórico), keep it as-is
 * if it has no ACTIVE rows but has INACTIVE (histórico export).
 */
function employeesForAllMirrorPdf(employees: Employee[]): Employee[] {
  const active = employees.filter(e => e.status !== 'INACTIVE');
  if (active.length > 0) return active;
  return employees.filter(e => e.status === 'INACTIVE');
}

function daysForActiveEmployees(days: TimesheetDay[], employees: Employee[]): TimesheetDay[] {
  const keys = new Set<string>();
  for (const e of employees) {
    if (e.id) keys.add(e.id);
    if (e.employeeId) keys.add(e.employeeId);
  }
  return days.filter(d => keys.has(d.employeeId));
}

function reviewStatusLabel(
  review: TimesheetEmployeeReview | null,
  periodDays: TimesheetDay[],
  labels: TimesheetPdfLabels,
  statusLabel: (code: string) => string
): string {
  if (review?.status === 'APPROVED') return labels.reviewApproved;

  const total = periodDays.length;
  const acked = periodDays.filter(d => d.managerAck).length;
  // Day-level manager OK is the operational approval used in the mirror UI.
  if (total > 0 && acked === total) return labels.reviewApproved;

  if (review && review.status !== 'OPEN') return statusLabel(review.status);

  if (acked > 0 && labels.reviewPartial) {
    return interpolateLabel(labels.reviewPartial, {
      done: String(acked),
      total: String(total),
    });
  }
  return labels.reviewPending;
}

function interpolateLabel(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
  }
  return out;
}

function ensureSpace(doc: Awaited<ReturnType<typeof createPdfDocument>>, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 18) {
    doc.addPage();
    return 22;
  }
  return y;
}

type PdfDoc = Awaited<ReturnType<typeof createPdfDocument>>;

/** Draws one employee's full daily mirror into an existing document. */
async function renderMirrorForEmployee(
  doc: PdfDoc,
  opts: {
    period: TimesheetPeriod;
    org: PdfOrgInfo;
    employee: Employee;
    days: TimesheetDay[];
    punches: Punch[];
    review: TimesheetEmployeeReview | null;
    labels: TimesheetPdfLabels;
    statusLabel: (dayStatus: string) => string;
    reviewStatusLabel: (code: string) => string;
    periodStatusLabel?: (code: string) => string;
    managerName?: string;
  },
  newPage: boolean,
): Promise<void> {
  const {
    period,
    org,
    employee,
    days,
    punches,
    review,
    labels,
    statusLabel,
    reviewStatusLabel: revLabel,
    periodStatusLabel,
    managerName,
  } = opts;

  if (newPage) doc.addPage();

  const periodDays = daysInPeriod(days, period).sort((a, b) => a.workDate.localeCompare(b.workDate));
  const punchesByDate = groupPunchesByDate(punches);

  const subtitle = `${labels.periodRange}: ${formatIsoDateBr(period.startDate)} — ${formatIsoDateBr(period.endDate)} · ${employee.name}`;

  let y = await drawReportHeader(doc, {
    org,
    title: labels.title,
    subtitle,
  });

  const managerAcked = periodDays.filter(d => d.managerAck).length;
  const na = labels.notAvailable;
  const cpfDisplay = formatCpfDisplay(employee.cpf || '') || na;
  const pisDisplay = formatPisDisplay(employee.employeeId) || displayField(employee.employeeId, na);
  const approval = reviewStatusLabel(review, periodDays, labels, revLabel);
  const periodStatus =
    labels.periodStatus && periodStatusLabel
      ? periodStatusLabel(period.status)
      : period.status;

  y = drawFormSection(
    doc,
    y,
    labels.employeeSection,
    [
      { label: labels.name, value: displayField(employee.name, na) },
      { label: labels.employeeId, value: pisDisplay },
      { label: labels.cpf, value: cpfDisplay },
      { label: labels.department, value: displayField(employee.department, na) },
      { label: labels.designation, value: displayField(employee.designation, na) },
      { label: labels.reviewStatus, value: approval },
      {
        label: labels.managerAckSummary || labels.reviewStatus,
        value: `${managerAcked}/${periodDays.length}`,
      },
      ...(labels.periodStatus
        ? [{ label: labels.periodStatus, value: periodStatus }]
        : []),
    ],
    undefined,
    { columns: 2 },
  );

  const totals = {
    expected: periodDays.reduce((s, d) => s + (d.expectedMinutes || 0), 0),
    worked: periodDays.reduce((s, d) => s + (d.workedMinutes || 0), 0),
    overtime: periodDays.reduce((s, d) => s + (d.overtimeMinutes || 0), 0),
    absence: periodDays.reduce((s, d) => s + displayAbsenceMinutes(d), 0),
  };

  y = drawMetricStrip(
    doc,
    y,
    [
      ...(labels.metricExpected
        ? [{ label: labels.metricExpected, value: minutesToDisplay(totals.expected), tone: 'neutral' as const }]
        : []),
      { label: labels.metricWorked, value: minutesToDisplay(totals.worked), tone: 'neutral' },
      { label: labels.metricOvertime, value: minutesToDisplay(totals.overtime), tone: 'leave' },
      {
        label: labels.metricAbsence,
        value: minutesToDisplay(totals.absence),
        tone: totals.absence > 0 ? 'absent' : 'present',
      },
    ],
    labels.metricsSection,
  );

  const noteLines: string[] = [];
  const adjustedRowIndexes = new Set<number>();

  const tableRows = periodDays.map((day, rowIndex) => {
    const dayPunches = punchesByDate.get(day.workDate) ?? [];
    const slots = pairPunchesToSlots(dayPunches, day.workDate);
    const adjusted = dayHadPunchAdjustment(day, dayPunches);
    if (adjusted) adjustedRowIndexes.add(rowIndex);

    const exit2 = slotTime(slots.exit2);
    const exit2Cell =
      slots.overflow.length > 0
        ? `${exit2 === '—' ? '' : exit2}${exit2 === '—' ? '' : ' '}(+${slots.overflow.length})`.trim()
        : exit2;

    if (slots.overflow.length > 0) {
      const times = slots.overflow
        .map(p =>
          formatTime(p.punchedAt, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'America/Sao_Paulo',
          }),
        )
        .join(' · ');
      noteLines.push(
        interpolateLabel(labels.extraPunchesLine, {
          date: formatIsoDateBr(day.workDate),
          times,
        }),
      );
    }
    const remark = dayRemarkText(day);
    if (remark) {
      noteLines.push(
        interpolateLabel(labels.remarksLine, {
          date: formatIsoDateBr(day.workDate),
          text: remark,
        }),
      );
    }

    const statusText = statusLabel(day.status) + (adjusted ? '*' : '');

    return [
      formatDayCell(day.workDate),
      slotTime(slots.entry1),
      slotTime(slots.exit1),
      slotTime(slots.entry2),
      exit2Cell,
      minutesToDisplay(day.workedMinutes),
      minutesToDisplay(day.overtimeMinutes),
      minutesToDisplay(displayAbsenceMinutes(day)),
      statusText,
    ];
  });

  if (adjustedRowIndexes.size > 0 && labels.adjustedDayLegend) {
    noteLines.unshift(labels.adjustedDayLegend);
  }

  applyStandardTable(doc, {
    startY: y,
    head: [[
      labels.colDay,
      labels.colEntry1,
      labels.colExit1,
      labels.colEntry2,
      labels.colExit2,
      labels.colWorked,
      labels.colOvertime,
      labels.colAbsence,
      labels.colStatus,
    ]],
    body: tableRows,
    foot: [[
      labels.totalsRow,
      '',
      '',
      '',
      '',
      minutesToDisplay(totals.worked),
      minutesToDisplay(totals.overtime),
      minutesToDisplay(totals.absence),
      '',
    ]],
    showFoot: 'lastPage',
    styles: { fontSize: 6, cellPadding: 1.5 },
    headStyles: { fontSize: 6, cellPadding: 1.5 },
    footStyles: {
      fillColor: [248, 250, 252],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 6,
    },
    columnStyles: MIRROR_TABLE_COLUMN_STYLES,
    willDrawCell: (data: { section: string; row: { index: number }; cell: { styles: { fillColor?: number[] } } }) => {
      if (data.section === 'body' && adjustedRowIndexes.has(data.row.index)) {
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  let afterY = (doc.lastAutoTable?.finalY ?? y) + 8;

  if (noteLines.length > 0) {
    afterY = ensureSpace(doc, afterY, 10 + noteLines.length * 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(labels.notesSection, 14, afterY);
    afterY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    for (const line of noteLines) {
      afterY = ensureSpace(doc, afterY, 6);
      const wrapped = doc.splitTextToSize(`• ${line}`, doc.internal.pageSize.getWidth() - 28);
      doc.text(wrapped, 14, afterY);
      afterY += wrapped.length * 3.8 + 1.2;
    }
    afterY += 4;
  }

  afterY = ensureSpace(doc, afterY, 22);
  drawSignatureBlock(doc, afterY, [
    { label: labels.signatureEmployee, name: displayField(employee.name, '') },
    { label: labels.signatureManager, name: displayField(managerName, '') },
  ]);
}

/** Draws the all-employees summary overview (one row per employee) into a doc. */
async function renderSummarySection(
  doc: PdfDoc,
  opts: {
    period: TimesheetPeriod;
    org: PdfOrgInfo;
    employees: Employee[];
    days: TimesheetDay[];
    reviews: TimesheetEmployeeReview[];
    labels: TimesheetPdfLabels;
    reviewStatusLabel: (code: string) => string;
  },
): Promise<void> {
  const { period, org, employees, days, reviews, labels, reviewStatusLabel: revLabel } = opts;

  const subtitle = `${labels.periodRange}: ${formatIsoDateBr(period.startDate)} — ${formatIsoDateBr(period.endDate)} · ${labels.summarySection}`;

  let y = await drawReportHeader(doc, {
    org,
    title: labels.title,
    subtitle,
  });

  const perEmployee = employees
    .map(emp => {
      const empDays = daysInPeriod(daysForEmployee(days, emp), period);
      if (!empDays.length) return null;
      const review = resolveReview(reviews, emp);
      const expected = empDays.reduce((s, d) => s + (d.expectedMinutes || 0), 0);
      const worked = empDays.reduce((s, d) => s + (d.workedMinutes || 0), 0);
      const overtime = empDays.reduce((s, d) => s + (d.overtimeMinutes || 0), 0);
      const absence = empDays.reduce((s, d) => s + displayAbsenceMinutes(d), 0);
      return {
        name: emp.name || '',
        row: [
          emp.name,
          emp.employeeId || '—',
          minutesToDisplay(worked),
          minutesToDisplay(overtime),
          minutesToDisplay(absence),
          reviewStatusLabel(review, empDays, labels, revLabel),
        ],
        expected,
        worked,
        overtime,
        absence,
      };
    })
    .filter(Boolean) as Array<{
    name: string;
    row: string[];
    expected: number;
    worked: number;
    overtime: number;
    absence: number;
  }>;

  perEmployee.sort((a, b) => a.name.localeCompare(b.name));

  const totals = perEmployee.reduce(
    (acc, e) => ({
      expected: acc.expected + e.expected,
      worked: acc.worked + e.worked,
      overtime: acc.overtime + e.overtime,
      absence: acc.absence + e.absence,
    }),
    { expected: 0, worked: 0, overtime: 0, absence: 0 },
  );

  y = drawMetricStrip(doc, y, [
    ...(labels.metricExpected
      ? [{ label: labels.metricExpected, value: minutesToDisplay(totals.expected), tone: 'neutral' as const }]
      : []),
    { label: labels.metricWorked, value: minutesToDisplay(totals.worked), tone: 'neutral' },
    { label: labels.metricOvertime, value: minutesToDisplay(totals.overtime), tone: 'leave' },
    { label: labels.metricAbsence, value: minutesToDisplay(totals.absence), tone: 'absent' },
  ]);

  applyStandardTable(doc, {
    startY: y,
    head: [[
      labels.colEmployee,
      labels.employeeId,
      labels.colWorked,
      labels.colOvertime,
      labels.colAbsence,
      labels.reviewStatus,
    ]],
    body: perEmployee.map(e => e.row),
    foot: [[
      labels.totalsRow,
      '',
      minutesToDisplay(totals.worked),
      minutesToDisplay(totals.overtime),
      minutesToDisplay(totals.absence),
      '',
    ]],
    showFoot: 'lastPage',
    styles: { fontSize: 7, cellPadding: 2 },
    footStyles: {
      fillColor: [248, 250, 252],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7,
    },
  });
}

function drawTimesheetFooters(doc: PdfDoc, labels: TimesheetPdfLabels): void {
  const generated = interpolateLabel(labels.generatedBy, {
    date: formatGeneratedAt(),
    app: APP_NAME,
  });
  drawReportFooters(
    doc,
    generated,
    (current, total) =>
      interpolateLabel(labels.page, {
        current: String(current),
        total: String(total),
      }),
  );
}

export const timesheetPdfExportService = {
  async getOrgInfo(): Promise<PdfOrgInfo> {
    try {
      const branding = await organizationService.getOrgBranding();
      return {
        name: branding.name,
        address: branding.address,
        logoDataUrl: branding.logoDataUrl,
      };
    } catch {
      return { name: '', address: '', logoDataUrl: null };
    }
  },

  async buildEmployeeMirrorPdf(opts: {
    period: TimesheetPeriod;
    org: PdfOrgInfo;
    employee: Employee;
    days: TimesheetDay[];
    punches: Punch[];
    review: TimesheetEmployeeReview | null;
    labels: TimesheetPdfLabels;
    statusLabel: (dayStatus: string) => string;
    reviewStatusLabel: (code: string) => string;
    periodStatusLabel?: (code: string) => string;
    managerName?: string;
  }): Promise<Blob> {
    const doc = await createPdfDocument('portrait');
    await renderMirrorForEmployee(doc, opts, false);
    drawTimesheetFooters(doc, opts.labels);
    return doc.output('blob') as Blob;
  },

  async buildPeriodSummaryPdf(opts: {
    period: TimesheetPeriod;
    org: PdfOrgInfo;
    employees: Employee[];
    days: TimesheetDay[];
    reviews: TimesheetEmployeeReview[];
    labels: TimesheetPdfLabels;
    reviewStatusLabel: (code: string) => string;
  }): Promise<Blob> {
    const doc = await createPdfDocument('portrait');
    await renderSummarySection(doc, opts);
    drawTimesheetFooters(doc, opts.labels);
    return doc.output('blob') as Blob;
  },

  /**
   * Single PDF for the "Todos" filter: an overview summary page followed by
   * each employee's full daily mirror (one employee per new page).
   */
  async buildAllEmployeesDetailedPdf(opts: {
    period: TimesheetPeriod;
    org: PdfOrgInfo;
    employees: Employee[];
    days: TimesheetDay[];
    punches: Punch[];
    reviews: TimesheetEmployeeReview[];
    labels: TimesheetPdfLabels;
    statusLabel: (dayStatus: string) => string;
    reviewStatusLabel: (code: string) => string;
    periodStatusLabel?: (code: string) => string;
    exportedBy?: PdfActingUser;
  }): Promise<Blob> {
    const doc = await createPdfDocument('portrait');

    // Page 1: overview across all employees.
    await renderSummarySection(doc, {
      period: opts.period,
      org: opts.org,
      employees: opts.employees,
      days: opts.days,
      reviews: opts.reviews,
      labels: opts.labels,
      reviewStatusLabel: opts.reviewStatusLabel,
    });

    // Only employees with days in the period, ordered by name for a stable read.
    const withDays = opts.employees
      .map(emp => ({
        emp,
        empDays: daysInPeriod(daysForEmployee(opts.days, emp), opts.period),
      }))
      .filter(e => e.empDays.length > 0)
      .sort((a, b) => (a.emp.name || '').localeCompare(b.emp.name || ''));

    for (const { emp, empDays } of withDays) {
      const empPunches = punchesForEmployee(opts.punches, emp);
      const lineManager = emp.lineManagerId
        ? opts.employees.find(e => e.id === emp.lineManagerId)
        : undefined;
      const review = resolveReview(opts.reviews, emp);
      await renderMirrorForEmployee(
        doc,
        {
          period: opts.period,
          org: opts.org,
          employee: emp,
          days: empDays,
          punches: empPunches,
          review,
          labels: opts.labels,
          statusLabel: opts.statusLabel,
          reviewStatusLabel: opts.reviewStatusLabel,
          periodStatusLabel: opts.periodStatusLabel,
          managerName: resolvePdfManagerName({
            periodDays: empDays,
            punches: empPunches,
            employees: opts.employees,
            review,
            exportedBy: opts.exportedBy,
            lineManagerName: lineManager?.name,
          }),
        },
        true,
      );
    }

    drawTimesheetFooters(doc, opts.labels);
    return doc.output('blob') as Blob;
  },

  async exportMirrorPdf(opts: {
    period: TimesheetPeriod;
    employeeFilter: string;
    employees: Employee[];
    days: TimesheetDay[];
    punches: Punch[];
    reviews: TimesheetEmployeeReview[];
    labels: TimesheetPdfLabels;
    dayStatusLabel: (status: string) => string;
    reviewStatusLabel: (code: string) => string;
    periodStatusLabel?: (code: string) => string;
    exportedBy?: PdfActingUser;
    /** RH export requires manager ack on elapsed days. Employee self-download may skip. */
    requireManagerAcks?: boolean;
  }): Promise<{ blob: Blob; filename: string }> {
    const org = await this.getOrgInfo();
    const ym = `${opts.period.year}_${String(opts.period.month).padStart(2, '0')}`;
    const requireAcks = opts.requireManagerAcks !== false;

    if (opts.employeeFilter !== 'ALL') {
      const employee = opts.employees.find(
        e => e.id === opts.employeeFilter || e.employeeId === opts.employeeFilter
      );
      if (!employee) throw new Error('employee_not_found');
      const empDays = daysInPeriod(daysForEmployee(opts.days, employee), opts.period);
      if (!empDays.length) throw new Error('employee_no_days');
      if (requireAcks) {
        const pdfGate = canExportMirrorPdf(empDays);
        if (!pdfGate.ok) throw new Error('mirror_pdf_requires_all_approved');
      }
      // Fresh load clears wrongly AUTO-ignored CLOCK (proximity must be per employee).
      const freshPunches = await loadPunchesForEmployees(
        [employee],
        opts.period.startDate,
        opts.period.endDate,
      );
      const empPunches = punchesForEmployee(freshPunches, employee);
      const lineManager = employee.lineManagerId
        ? opts.employees.find(e => e.id === employee.lineManagerId)
        : undefined;
      const review = resolveReview(opts.reviews, employee);
      const blob = await this.buildEmployeeMirrorPdf({
        period: opts.period,
        org,
        employee,
        days: empDays,
        punches: empPunches,
        review,
        labels: opts.labels,
        statusLabel: opts.dayStatusLabel,
        reviewStatusLabel: opts.reviewStatusLabel,
        periodStatusLabel: opts.periodStatusLabel,
        managerName: resolvePdfManagerName({
          periodDays: empDays,
          punches: empPunches,
          employees: opts.employees,
          review,
          exportedBy: opts.exportedBy,
          lineManagerName: lineManager?.name,
        }),
      });
      const safeName = (employee.name || employee.employeeId || employee.id).replace(/[^\w.-]+/g, '_');
      return { blob, filename: `espelho_ponto_${safeName}_${ym}.pdf` };
    }

    // "Todos": only ACTIVE collaborators (demitidos ficam de fora do PDF combinado).
    const activeEmployees = employeesForAllMirrorPdf(opts.employees);
    const activeDays = daysForActiveEmployees(opts.days, activeEmployees);
    if (requireAcks) {
      const pdfGate = canExportMirrorPdf(activeDays);
      if (!pdfGate.ok) throw new Error('mirror_pdf_requires_all_approved');
    }

    // Fresh per-employee punch load — do not rely on org-wide UI list (5000 cap).
    const completePunches = await loadPunchesForEmployees(
      activeEmployees,
      opts.period.startDate,
      opts.period.endDate,
    );

    const blob = await this.buildAllEmployeesDetailedPdf({
      period: opts.period,
      org,
      employees: activeEmployees,
      days: activeDays,
      punches: completePunches,
      reviews: opts.reviews,
      labels: opts.labels,
      statusLabel: opts.dayStatusLabel,
      reviewStatusLabel: opts.reviewStatusLabel,
      periodStatusLabel: opts.periodStatusLabel,
      exportedBy: opts.exportedBy,
    });
    return { blob, filename: `espelho_ponto_completo_${ym}.pdf` };
  },
};
