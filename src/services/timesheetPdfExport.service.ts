import { pairPunchesToSlots, groupPunchesByDate } from './punch.service';
import { organizationService } from './organization.service';
import { formatIsoDateBr, formatTime } from '../i18n/format';
import { normalizeCpf } from '../utils/employeeCredentials';
import {
  applyStandardTable,
  createPdfDocument,
  drawMetricStrip,
  drawReportFooters,
  drawReportHeader,
  drawFormSection,
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
  return formatTime(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
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
      worked: days.reduce((s, d) => s + d.workedMinutes, 0),
      overtime: days.reduce((s, d) => s + d.overtimeMinutes, 0),
      late: days.reduce((s, d) => s + d.lateMinutes, 0),
      absence: days.reduce((s, d) => s + d.absenceMinutes, 0),
    };

    y = drawMetricStrip(doc, y, [
      { label: labels.metricWorked, value: minutesToDisplay(totals.worked), tone: 'neutral' },
      { label: labels.metricOvertime, value: minutesToDisplay(totals.overtime), tone: 'leave' },
      { label: labels.metricLate, value: minutesToDisplay(totals.late), tone: 'late' },
      { label: labels.metricAbsence, value: minutesToDisplay(totals.absence), tone: 'absent' },
    ]);

    const tableRows = days.map(day => {
      const slots = pairPunchesToSlots(punchesByDate.get(day.workDate) ?? [], day.workDate);
      return [
        formatIsoDateBr(day.workDate),
        slotTime(slots.entry1),
        slotTime(slots.exit1),
        slotTime(slots.entry2),
        slotTime(slots.exit2),
        minutesToDisplay(day.workedMinutes),
        minutesToDisplay(day.overtimeMinutes),
        minutesToDisplay(day.lateMinutes),
        minutesToDisplay(day.absenceMinutes),
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
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 22 },
        5: { halign: 'center' },
        6: { halign: 'center' },
        7: { halign: 'center' },
        8: { halign: 'center' },
      },
    });

    drawReportFooters(
      doc,
      labels.generatedBy.replace('{{date}}', formatGeneratedAt()),
      (current, total) => labels.page.replace('{{current}}', String(current)).replace('{{total}}', String(total))
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

    const tableRows = employees
      .map(emp => {
        const empDays = daysForEmployee(days, emp);
        if (!empDays.length) return null;
        const review = resolveReview(reviews, emp);
        return [
          emp.name,
          emp.employeeId || '—',
          minutesToDisplay(empDays.reduce((s, d) => s + d.workedMinutes, 0)),
          minutesToDisplay(empDays.reduce((s, d) => s + d.overtimeMinutes, 0)),
          minutesToDisplay(empDays.reduce((s, d) => s + d.lateMinutes, 0)),
          minutesToDisplay(empDays.reduce((s, d) => s + d.absenceMinutes, 0)),
          reviewStatusLabel(review, labels, revLabel),
        ];
      })
      .filter(Boolean) as string[][];

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
      body: tableRows,
      styles: { fontSize: 7.5, cellPadding: 2.5 },
    });

    drawReportFooters(
      doc,
      labels.generatedBy.replace('{{date}}', formatGeneratedAt()),
      (current, total) => labels.page.replace('{{current}}', String(current)).replace('{{total}}', String(total))
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
