import { organizationService } from './organization.service';
import { isWorkingDay, resolveShiftDay } from './timeCalculation.service';
import {
  applyStandardTable,
  createPdfDocument,
  drawReportFooters,
  drawReportHeader,
  formatGeneratedAt,
  PDF_COLORS,
  PDF_MARGIN,
  PdfOrgInfo,
  type JsPdfDoc,
} from '../utils/reportPdf';
import type { Employee, Holiday, Shift, WorkRosterAssignment } from '../types';

export type RosterPdfLabels = {
  titleTeam: string;
  titleIndividual: string;
  monthLabel: string;
  employee: string;
  shift: string;
  department: string;
  legendWork: string;
  legendOff: string;
  legendHoliday: string;
  legendSaturday: string;
  legendShiftDay: string;
  colDate: string;
  colDay: string;
  colStatus: string;
  colShift: string;
  generatedAt: string;
  page: string;
};

export type RosterDayStatus = 'WORK' | 'OFF' | 'SHIFT' | 'HOLIDAY_OFF';

export interface RosterCalendarDay {
  date: string;
  weekdayLabel: string;
  status: RosterDayStatus;
  shiftLabel: string;
  isSaturday: boolean;
  isHoliday: boolean;
  holidayName?: string;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function monthRange(year: number, month: number): { start: string; end: string; days: string[] } {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(`${year}-${pad2(month)}-${pad2(d)}`);
  }
  return {
    start: days[0]!,
    end: days[days.length - 1]!,
    days,
  };
}

function weekdayLabel(iso: string, locale: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' });
}

function isSaturday(iso: string): boolean {
  return new Date(`${iso}T12:00:00`).getDay() === 6;
}

export function buildEmployeeCalendarDays(
  year: number,
  month: number,
  employee: Employee,
  shift: Shift | null,
  holidays: Holiday[],
  rosterAssignments: WorkRosterAssignment[],
  locale: string,
): RosterCalendarDay[] {
  const { days } = monthRange(year, month);
  const holidayMap = new Map(holidays.map(h => [h.date, h.name]));
  const rosterByDate = new Map<string, WorkRosterAssignment>();
  const empKeys = new Set([employee.id, employee.employeeId].filter(Boolean));

  for (const a of rosterAssignments) {
    if (empKeys.has(a.employeeId)) rosterByDate.set(a.workDate, a);
  }

  return days.map(date => {
    const sat = isSaturday(date);
    const holName = holidayMap.get(date);
    const isHol = !!holName;
    const roster = rosterByDate.get(date);

    let status: RosterDayStatus = 'OFF';
    let shiftLabel = '—';

    if (sat || isHol) {
      if (roster) {
        status = roster.status === 'WORK' ? 'WORK' : 'OFF';
      } else {
        status = 'OFF';
      }
      shiftLabel = status === 'WORK' ? (shift?.name ?? '—') : labelsOff(locale);
    } else if (shift && isWorkingDay(date, shift.workingDays ?? [])) {
      status = 'SHIFT';
      const dayShift = resolveShiftDay(shift, date);
      shiftLabel = dayShift.startTime && dayShift.endTime
        ? `${dayShift.startTime}–${dayShift.endTime}`
        : (shift.name ?? '—');
    } else {
      status = 'OFF';
      shiftLabel = labelsOff(locale);
    }

    return {
      date,
      weekdayLabel: weekdayLabel(date, locale),
      status,
      shiftLabel,
      isSaturday: sat,
      isHoliday: isHol,
      holidayName: holName,
    };
  });
}

function labelsOff(locale: string): string {
  return locale.startsWith('en') ? 'Off' : 'Folga';
}

function statusLabel(status: RosterDayStatus, labels: RosterPdfLabels, day: RosterCalendarDay): string {
  if (day.isHoliday && day.status === 'WORK') return labels.legendWork;
  if (day.isHoliday && day.status !== 'WORK') return labels.legendHoliday;
  if (day.isSaturday) return day.status === 'WORK' ? labels.legendWork : labels.legendSaturday;
  if (status === 'SHIFT') return labels.legendShiftDay;
  return labels.legendOff;
}

async function resolveOrg(): Promise<PdfOrgInfo> {
  const config = await organizationService.getConfig();
  return {
    name: config.companyName || 'Eletropasso',
    address: '',
    logoDataUrl: null,
  };
}

function pdfToBase64(doc: JsPdfDoc): string {
  const dataUri = doc.output('datauristring') as string;
  return dataUri;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function finalizePdf(doc: JsPdfDoc, fileName: string, download: boolean, pageLabel: string): Promise<{ base64: string; fileName: string; blob: Blob }> {
  drawReportFooters(doc, formatGeneratedAt(), (cur, tot) => `${pageLabel} ${cur}/${tot}`);
  const blob = doc.output('blob') as Blob;
  const base64 = await blobToBase64(blob);
  if (download) doc.save(fileName);
  return { base64, fileName, blob };
}

function drawCalendarGrid(
  doc: JsPdfDoc,
  startY: number,
  days: RosterCalendarDay[],
  labels: RosterPdfLabels,
  locale: string,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_MARGIN;
  const cellW = (pageWidth - margin * 2) / 7;
  const cellH = 18;
  let y = startY;

  const weekdayHeaders = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 7 + i);
    return d.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 3);
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  weekdayHeaders.forEach((h, i) => {
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(h.toUpperCase(), margin + i * cellW + cellW / 2, y, { align: 'center' });
  });
  y += 5;

  const firstDow = new Date(`${days[0]!.date}T12:00:00`).getDay();
  let col = firstDow;
  let row = 0;

  const fillForStatus = (status: RosterDayStatus, day: RosterCalendarDay): [number, number, number] => {
    if (day.status === 'WORK' || status === 'SHIFT') return PDF_COLORS.present;
    if (day.isHoliday) return PDF_COLORS.leave;
    return PDF_COLORS.surfaceAlt;
  };

  for (const day of days) {
    const x = margin + col * cellW;
    const cy = y + row * cellH;

    doc.setFillColor(...fillForStatus(day.status, day));
    doc.setDrawColor(...PDF_COLORS.border);
    if (doc.roundedRect) {
      doc.roundedRect(x + 0.5, cy, cellW - 1, cellH - 1, 1.5, 1.5, 'FD');
    } else {
      doc.rect(x + 0.5, cy, cellW - 1, cellH - 1, 'FD');
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(String(parseInt(day.date.slice(8), 10)), x + cellW / 2, cy + 6, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(...PDF_COLORS.muted);
    const st = statusLabel(day.status, labels, day);
    doc.text(st, x + cellW / 2, cy + 11, { align: 'center' });

    col++;
    if (col > 6) {
      col = 0;
      row++;
    }
  }

  return y + (row + 1) * cellH + 8;
}

export const rosterPdfService = {
  buildEmployeeCalendarDays,

  async exportIndividualPdf(params: {
    year: number;
    month: number;
    employee: Employee;
    shift: Shift | null;
    holidays: Holiday[];
    rosterAssignments: WorkRosterAssignment[];
    labels: RosterPdfLabels;
    locale: string;
    download?: boolean;
  }): Promise<{ base64: string; fileName: string }> {
    const { year, month, employee, shift, holidays, rosterAssignments, labels, locale, download = true } = params;
    const org = await resolveOrg();
    const doc = await createPdfDocument('portrait');
    const days = buildEmployeeCalendarDays(year, month, employee, shift, holidays, rosterAssignments, locale);

    const subtitle = `${employee.name} · ${month}/${year}`;
    let y = await drawReportHeader(doc, {
      org,
      title: labels.titleIndividual,
      subtitle,
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(`${labels.employee}: ${employee.name}`, PDF_MARGIN, y);
    y += 5;
    if (shift) {
      doc.text(`${labels.shift}: ${shift.name}`, PDF_MARGIN, y);
      y += 5;
    }
    if (employee.department) {
      doc.text(`${labels.department}: ${employee.department}`, PDF_MARGIN, y);
      y += 8;
    }

    y = drawCalendarGrid(doc, y, days, labels, locale);

    applyStandardTable(doc, {
      startY: y,
      head: [[labels.colDate, labels.colDay, labels.colStatus, labels.colShift]],
      body: days
        .filter(d => d.isSaturday || d.isHoliday || d.status === 'SHIFT')
        .map(d => [
          d.date.split('-').reverse().join('/'),
          d.weekdayLabel,
          statusLabel(d.status, labels, d),
          d.shiftLabel,
        ]),
    });

    const fileName = `escala-${employee.name.replace(/\s+/g, '_')}-${year}-${pad2(month)}.pdf`;
    const result = await finalizePdf(doc, fileName, download, labels.page);
    return { base64: result.base64, fileName };
  },

  async exportTeamPdf(params: {
    year: number;
    month: number;
    employees: Employee[];
    shifts: Shift[];
    holidays: Holiday[];
    rosterAssignments: WorkRosterAssignment[];
    labels: RosterPdfLabels;
    locale: string;
    download?: boolean;
  }): Promise<{ base64: string; fileName: string }> {
    const { year, month, employees, shifts, holidays, rosterAssignments, labels, locale, download = true } = params;
    const org = await resolveOrg();
    const doc = await createPdfDocument('landscape');
    const shiftById = new Map(shifts.map(s => [s.id, s]));
    const { days: monthDays } = monthRange(year, month);
    const rosterDates = [...new Set(rosterAssignments.map(a => a.workDate))].sort();
    const satAndHolDates = monthDays.filter(d => isSaturday(d) || holidays.some(h => h.date === d));
    const columns = satAndHolDates.length ? satAndHolDates : rosterDates;

    const subtitle = `${labels.monthLabel} ${month}/${year}`;
    await drawReportHeader(doc, {
      org,
      title: labels.titleTeam,
      subtitle,
    });

    const head = [labels.employee, ...columns.map(d => {
      const parts = d.split('-');
      return `${parts[2]}/${parts[1]}`;
    })];

    const body = employees.map(emp => {
      const shift = emp.shiftId ? shiftById.get(emp.shiftId) ?? null : null;
      const calDays = buildEmployeeCalendarDays(year, month, emp, shift, holidays, rosterAssignments, locale);
      const byDate = new Map(calDays.map(d => [d.date, d]));
      return [
        emp.name,
        ...columns.map(d => {
          const day = byDate.get(d);
          if (!day) return '—';
          return day.status === 'WORK' || day.status === 'SHIFT' ? 'T' : 'F';
        }),
      ];
    });

    applyStandardTable(doc, {
      startY: 42,
      head: [head],
      body,
      styles: { fontSize: 7, cellPadding: 1.5 },
    });

    const fileName = `escala-equipe-${year}-${pad2(month)}.pdf`;
    const result = await finalizePdf(doc, fileName, download, labels.page);
    return { base64: result.base64, fileName };
  },

  async generateIndividualPdfsForTeam(params: {
    year: number;
    month: number;
    employees: Employee[];
    shifts: Shift[];
    holidays: Holiday[];
    rosterAssignments: WorkRosterAssignment[];
    labels: RosterPdfLabels;
    locale: string;
  }): Promise<Map<string, { base64: string; fileName: string }>> {
    const shiftById = new Map(params.shifts.map(s => [s.id, s]));
    const map = new Map<string, { base64: string; fileName: string }>();
    for (const emp of params.employees) {
      const shift = emp.shiftId ? shiftById.get(emp.shiftId) ?? null : null;
      const pdf = await this.exportIndividualPdf({
        ...params,
        employee: emp,
        shift,
        download: false,
      });
      map.set(emp.id, pdf);
    }
    return map;
  },
};
