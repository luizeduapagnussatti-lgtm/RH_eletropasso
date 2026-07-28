import { pairPunchesToSlots, groupPunchesByDate } from './punch.service';
import { organizationService } from './organization.service';
import { formatIsoDateBr, formatTime, getDateLocale } from '../i18n/format';
import { normalizeCpf } from '../utils/employeeCredentials';
import { displayAbsenceMinutes } from '../utils/timesheetDisplay';
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
  reviewStatus: string;
  reviewApproved: string;
  reviewPending: string;
  managerAckSummary?: string;
  colDay: string;
  colEntry1: string;
  colExit1: string;
  colEntry2: string;
  colExit2: string;
  colWorked: string;
  colOvertime: string;
  colLate: string;
  colAbsence: string;
  colStatus: string;
  colEmployee: string;
  metricWorked: string;
  metricOvertime: string;
  metricLate: string;
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
};

function minutesToDisplay(mins: number): string {
  if (!mins) return '—';
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  const sign = mins < 0 ? '-' : '';
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

function reviewStatusLabel(
  review: TimesheetEmployeeReview | null,
  labels: TimesheetPdfLabels,
  statusLabel: (code: string) => string
): string {
  if (!review || review.status === 'OPEN') return labels.reviewPending;
  if (review.status === 'APPROVED') return labels.reviewApproved;
  return statusLabel(review.status);
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
  }): Promise<Blob> {
    const { period, org, employee, days, punches, review, labels, statusLabel, reviewStatusLabel: revLabel } = opts;
    const doc = await createPdfDocument('landscape');
    const punchesByDate = groupPunchesByDate(punches);

    const subtitle = `${labels.periodRange}: ${formatIsoDateBr(period.startDate)} — ${formatIsoDateBr(period.endDate)} · ${employee.name}`;

    let y = await drawReportHeader(doc, {
      org,
      title: labels.title,
      subtitle,
    });

    y = drawFormSection(doc, y, labels.employeeSection, [
      { label: labels.name, value: employee.name || labels.notAvailable },
      { label: labels.employeeId, value: employee.employeeId || labels.notAvailable },
      { label: labels.cpf, value: normalizeCpf(employee.cpf || '') || labels.notAvailable },
      { label: labels.department, value: employee.department || labels.notAvailable },
      {
        label: labels.reviewStatus,
        value: reviewStatusLabel(review, labels, revLabel),
      },
    ]);

    const totals = {
      worked: days.reduce((s, d) => s + (d.workedMinutes || 0), 0),
      overtime: days.reduce((s, d) => s + (d.overtimeMinutes || 0), 0),
      late: days.reduce((s, d) => s + (d.lateMinutes || 0), 0),
      absence: days.reduce((s, d) => s + displayAbsenceMinutes(d), 0),
    };

    y = drawMetricStrip(doc, y, [
      { label: labels.metricWorked, value: minutesToDisplay(totals.worked), tone: 'neutral' },
      { label: labels.metricOvertime, value: minutesToDisplay(totals.overtime), tone: 'leave' },
      { label: labels.metricLate, value: minutesToDisplay(totals.late), tone: 'late' },
      { label: labels.metricAbsence, value: minutesToDisplay(totals.absence), tone: 'absent' },
    ]);

    const noteLines: string[] = [];

    const tableRows = days.map(day => {
      const slots = pairPunchesToSlots(punchesByDate.get(day.workDate) ?? [], day.workDate);
      const exit2 = slotTime(slots.exit2);
      const exit2Cell =
        slots.overflow.length > 0
          ? `${exit2 === '—' ? '' : exit2}${exit2 === '—' ? '' : ' '}(+${slots.overflow.length})`.trim()
          : exit2;

      if (slots.overflow.length > 0) {
        const times = slots.overflow
          .map(p => formatTime(p.punchedAt, { hour: '2-digit', minute: '2-digit', hour12: false }))
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

      return [
        formatDayCell(day.workDate),
        slotTime(slots.entry1),
        slotTime(slots.exit1),
        slotTime(slots.entry2),
        exit2Cell,
        minutesToDisplay(day.workedMinutes),
        minutesToDisplay(day.overtimeMinutes),
        minutesToDisplay(day.lateMinutes),
        minutesToDisplay(displayAbsenceMinutes(day)),
        statusLabel(day.status),
      ];
    });

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
        labels.colLate,
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
        minutesToDisplay(totals.late),
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
      columnStyles: {
        0: { cellWidth: 28 },
        5: { halign: 'center' },
        6: { halign: 'center' },
        7: { halign: 'center' },
        8: { halign: 'center' },
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
      { label: labels.signatureEmployee, name: employee.name || '' },
      { label: labels.signatureManager, name: '' },
    ]);

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
    const { period, org, employees, days, reviews, labels, reviewStatusLabel: revLabel } = opts;
    const doc = await createPdfDocument('landscape');

    const subtitle = `${labels.periodRange}: ${formatIsoDateBr(period.startDate)} — ${formatIsoDateBr(period.endDate)} · ${labels.summarySection}`;

    let y = await drawReportHeader(doc, {
      org,
      title: labels.title,
      subtitle,
    });

    const perEmployee = employees
      .map(emp => {
        const empDays = daysForEmployee(days, emp);
        if (!empDays.length) return null;
        const review = resolveReview(reviews, emp);
        const worked = empDays.reduce((s, d) => s + (d.workedMinutes || 0), 0);
        const overtime = empDays.reduce((s, d) => s + (d.overtimeMinutes || 0), 0);
        const late = empDays.reduce((s, d) => s + (d.lateMinutes || 0), 0);
        const absence = empDays.reduce((s, d) => s + displayAbsenceMinutes(d), 0);
        return {
          row: [
            emp.name,
            emp.employeeId || '—',
            minutesToDisplay(worked),
            minutesToDisplay(overtime),
            minutesToDisplay(late),
            minutesToDisplay(absence),
            reviewStatusLabel(review, labels, revLabel),
          ],
          worked,
          overtime,
          late,
          absence,
        };
      })
      .filter(Boolean) as Array<{
      row: string[];
      worked: number;
      overtime: number;
      late: number;
      absence: number;
    }>;

    const totals = perEmployee.reduce(
      (acc, e) => ({
        worked: acc.worked + e.worked,
        overtime: acc.overtime + e.overtime,
        late: acc.late + e.late,
        absence: acc.absence + e.absence,
      }),
      { worked: 0, overtime: 0, late: 0, absence: 0 },
    );

    y = drawMetricStrip(doc, y, [
      { label: labels.metricWorked, value: minutesToDisplay(totals.worked), tone: 'neutral' },
      { label: labels.metricOvertime, value: minutesToDisplay(totals.overtime), tone: 'leave' },
      { label: labels.metricLate, value: minutesToDisplay(totals.late), tone: 'late' },
      { label: labels.metricAbsence, value: minutesToDisplay(totals.absence), tone: 'absent' },
    ]);

    applyStandardTable(doc, {
      startY: y,
      head: [[
        labels.colEmployee,
        labels.employeeId,
        labels.colWorked,
        labels.colOvertime,
        labels.colLate,
        labels.colAbsence,
        labels.reviewStatus,
      ]],
      body: perEmployee.map(e => e.row),
      foot: [[
        labels.totalsRow,
        '',
        minutesToDisplay(totals.worked),
        minutesToDisplay(totals.overtime),
        minutesToDisplay(totals.late),
        minutesToDisplay(totals.absence),
        '',
      ]],
      showFoot: 'lastPage',
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      footStyles: {
        fillColor: [248, 250, 252],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
    });

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
  }): Promise<{ blob: Blob; filename: string }> {
    const org = await this.getOrgInfo();
    const ym = `${opts.period.year}_${String(opts.period.month).padStart(2, '0')}`;

    if (opts.employeeFilter !== 'ALL') {
      const employee = opts.employees.find(
        e => e.id === opts.employeeFilter || e.employeeId === opts.employeeFilter
      );
      if (!employee) throw new Error('employee_not_found');
      const empDays = daysForEmployee(opts.days, employee);
      if (!empDays.length) throw new Error('employee_no_days');
      const punchKey = employee.employeeId || employee.id;
      const empPunches = opts.punches.filter(p => p.employeeId === punchKey || p.employeeId === employee.id);
      const blob = await this.buildEmployeeMirrorPdf({
        period: opts.period,
        org,
        employee,
        days: empDays,
        punches: empPunches,
        review: resolveReview(opts.reviews, employee),
        labels: opts.labels,
        statusLabel: opts.dayStatusLabel,
        reviewStatusLabel: opts.reviewStatusLabel,
      });
      const safeName = (employee.name || punchKey).replace(/[^\w.-]+/g, '_');
      return { blob, filename: `espelho_ponto_${safeName}_${ym}.pdf` };
    }

    const blob = await this.buildPeriodSummaryPdf({
      period: opts.period,
      org,
      employees: opts.employees,
      days: opts.days,
      reviews: opts.reviews,
      labels: opts.labels,
      reviewStatusLabel: opts.reviewStatusLabel,
    });
    return { blob, filename: `espelho_ponto_resumo_${ym}.pdf` };
  },
};
