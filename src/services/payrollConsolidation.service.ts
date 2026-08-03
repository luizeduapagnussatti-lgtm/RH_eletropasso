import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import { timesheetService } from './timesheet.service';
import { employeeService } from './employee.service';
import { organizationService } from './organization.service';
import {
  PayrollConsolidation,
  PayrollConsolidationStatus,
  TimesheetDay,
  TimesheetPeriod,
  Employee,
} from '../types';
import { classifyOvertimeMinutes, minutesToHours } from './overtimeClassification.service';
import { payrollReadinessService } from './payrollReadiness.service';
import { esocialRubricService } from './esocialRubric.service';
import { normalizeCnpj } from '../utils/employerCredentials';
import { normalizeCpf, normalizePis } from '../utils/employeeCredentials';
import { isPayrollExcluded } from '../utils/roles';

export const PAYROLL_EXPORT_VERSION = '1.0';

export interface PayrollExportV1 {
  version: string;
  generatedAt: string;
  competencia: {
    year: number;
    month: number;
    start: string;
    end: string;
    periodId: string;
    status: string;
  };
  empregador: {
    cnpj: string;
    razaoSocial: string;
    ambiente: string;
  };
  warnings?: string[];
  colaboradores: Array<{
    profileId: string;
    cpf: string;
    pis: string;
    nome: string;
    horasNormais: number;
    he50: number;
    he100: number;
    noturno: number;
    atraso: number;
    faltas: number;
    rubricas: Array<{ tipo: string; codigo: string; quantidadeHoras: number }>;
  }>;
}

const mapRow = (r: any, emp?: Employee): PayrollConsolidation => ({
  id: r.id,
  organizationId: r.organization_id,
  employeeId: r.employee_id,
  periodId: r.period_id || undefined,
  referenceMonth: r.reference_month,
  regularHours: Number(r.regular_hours),
  extraHours50: Number(r.extra_hours_50),
  extraHours100: Number(r.extra_hours_100),
  nightHours: Number(r.night_hours ?? 0),
  lateHours: Number(r.late_hours ?? 0),
  absenceHours: Number(r.absence_hours),
  status: r.status,
  approvedBy: r.approved_by || undefined,
  approvedAt: r.approved_at || undefined,
  notes: r.notes || undefined,
  employeeName: emp?.name,
  employeeCpf: emp?.cpf,
  employeePis: emp?.employeeId,
});

function resolveEmployee(employees: Employee[], key: string): Employee | undefined {
  return employees.find(e => e.id === key || e.employeeId === key);
}

function groupDaysByEmployee(days: TimesheetDay[], employees: Employee[]): Map<string, TimesheetDay[]> {
  const map = new Map<string, TimesheetDay[]>();
  for (const d of days) {
    const emp = resolveEmployee(employees, d.employeeId);
    const profileId = emp?.id || d.employeeId;
    const list = map.get(profileId) || [];
    list.push(d);
    map.set(profileId, list);
  }
  return map;
}

function aggregateEmployeeDays(
  empDays: TimesheetDay[],
  holidayDates: Set<string>
): {
  regularMinutes: number;
  extra50Minutes: number;
  extra100Minutes: number;
  nightMinutes: number;
  lateMinutes: number;
  absenceMinutes: number;
} {
  let regularMinutes = 0;
  let extra50Minutes = 0;
  let extra100Minutes = 0;
  let nightMinutes = 0;
  let lateMinutes = 0;
  let absenceMinutes = 0;

  for (const d of empDays) {
    const isHoliday = holidayDates.has(d.workDate);
    const { extra50Minutes: e50, extra100Minutes: e100 } = classifyOvertimeMinutes({
      workDate: d.workDate,
      overtimeMinutes: d.overtimeMinutes,
      isHoliday,
    });
    extra50Minutes += e50;
    extra100Minutes += e100;
    nightMinutes += d.nightMinutes;
    lateMinutes += d.lateMinutes;
    absenceMinutes += d.absenceMinutes;
    regularMinutes += Math.max(0, d.workedMinutes - d.overtimeMinutes);
  }

  return { regularMinutes, extra50Minutes, extra100Minutes, nightMinutes, lateMinutes, absenceMinutes };
}

async function getEmployer(orgId: string) {
  const { data, error } = await supabase
    .from('organizations')
    .select('cnpj, legal_name, name, esocial_ambiente')
    .eq('id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const payrollConsolidationService = {
  async listForPeriod(periodId: string): Promise<PayrollConsolidation[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];
    const { data, error } = await supabase
      .from('payroll_consolidations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('period_id', periodId)
      .order('created', { ascending: true });
    if (error) throw error;
    const employees = await employeeService.getEmployees();
    return (data || []).map(r => mapRow(r, employees.find(e => e.id === r.employee_id)));
  },

  async buildForPeriod(periodId: string): Promise<PayrollConsolidation[]> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const { data: periodRow, error: pErr } = await supabase
      .from('timesheet_periods')
      .select('*')
      .eq('id', periodId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!periodRow) throw new Error('Period not found');
    if (!['APPROVED', 'LOCKED'].includes(periodRow.status)) {
      throw new Error('Period must be APPROVED or LOCKED before pre-payroll');
    }

    const period: TimesheetPeriod = {
      id: periodRow.id,
      organizationId: periodRow.organization_id,
      year: periodRow.year,
      month: periodRow.month,
      startDate: periodRow.start_date,
      endDate: periodRow.end_date,
      status: periodRow.status,
    };

    const days = await timesheetService.listDays(periodId);
    const employees = await employeeService.getEmployees();
    const holidays = await organizationService.getHolidays();
    const holidayDates = new Set(holidays.map(h => h.date));
    const grouped = groupDaysByEmployee(days, employees);
    const referenceMonth = `${period.year}-${String(period.month).padStart(2, '0')}-01`;

    const results: PayrollConsolidation[] = [];
    for (const [profileId, empDays] of grouped) {
      const emp = employees.find(e => e.id === profileId) || resolveEmployee(employees, empDays[0]?.employeeId || '');
      if (!emp || isPayrollExcluded(emp)) continue;

      const agg = aggregateEmployeeDays(empDays, holidayDates);
      const row = {
        organization_id: orgId,
        employee_id: emp.id,
        period_id: periodId,
        reference_month: referenceMonth,
        regular_hours: minutesToHours(agg.regularMinutes),
        extra_hours_50: minutesToHours(agg.extra50Minutes),
        extra_hours_100: minutesToHours(agg.extra100Minutes),
        night_hours: minutesToHours(agg.nightMinutes),
        late_hours: minutesToHours(agg.lateMinutes),
        absence_hours: minutesToHours(agg.absenceMinutes),
        status: 'DRAFT' as PayrollConsolidationStatus,
        updated: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('payroll_consolidations')
        .upsert(row, { onConflict: 'organization_id,employee_id,reference_month' })
        .select()
        .single();
      if (error) throw error;
      results.push(mapRow(data, emp));
    }

    apiClient.notify();
    return results;
  },

  async setStatus(
    periodId: string,
    status: PayrollConsolidationStatus,
    userId?: string
  ): Promise<void> {
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');
    const payload: Record<string, unknown> = { status, updated: new Date().toISOString() };
    if (status === 'APPROVED' && userId) {
      payload.approved_by = userId;
      payload.approved_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from('payroll_consolidations')
      .update(payload)
      .eq('organization_id', orgId)
      .eq('period_id', periodId);
    if (error) throw error;
    apiClient.notify();
  },

  async buildExportV1(periodId: string): Promise<PayrollExportV1> {
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const { data: periodRow, error: pErr } = await supabase
      .from('timesheet_periods')
      .select('*')
      .eq('id', periodId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!periodRow) throw new Error('Period not found');

    const employer = await getEmployer(orgId);
    const cnpj = normalizeCnpj(employer?.cnpj);
    if (!cnpj) throw new Error('employer_cnpj_missing');

    let consolidations = await this.listForPeriod(periodId);
    if (!consolidations.length) {
      consolidations = await this.buildForPeriod(periodId);
    }

    const rubrics = await esocialRubricService.listActive();
    const rubricMap = Object.fromEntries(rubrics.map(r => [r.internalType, r]));
    const gaps = await payrollReadinessService.listGapsForPeriod(periodId);
    const warnings: string[] = [];
    if (gaps.length) {
      warnings.push(`${gaps.length} employee(s) with payroll data gaps (CPF/PIS/admission)`);
    }

    const colaboradores = consolidations.map(c => {
      const rubricas = [
        { tipo: 'REGULAR', codigo: rubricMap.REGULAR?.rubricCode || '1000', quantidadeHoras: c.regularHours },
        { tipo: 'HE_50', codigo: rubricMap.HE_50?.rubricCode || '1200', quantidadeHoras: c.extraHours50 },
        { tipo: 'HE_100', codigo: rubricMap.HE_100?.rubricCode || '1201', quantidadeHoras: c.extraHours100 },
        { tipo: 'NIGHT', codigo: rubricMap.NIGHT?.rubricCode || '1040', quantidadeHoras: c.nightHours },
        { tipo: 'ABSENCE', codigo: rubricMap.ABSENCE?.rubricCode || '9200', quantidadeHoras: c.absenceHours },
      ].filter(r => r.quantidadeHoras > 0);

      return {
        profileId: c.employeeId,
        cpf: normalizeCpf(c.employeeCpf || ''),
        pis: normalizePis(c.employeePis || ''),
        nome: c.employeeName || '',
        horasNormais: c.regularHours,
        he50: c.extraHours50,
        he100: c.extraHours100,
        noturno: c.nightHours,
        atraso: c.lateHours,
        faltas: c.absenceHours,
        rubricas,
      };
    });

    return {
      version: PAYROLL_EXPORT_VERSION,
      generatedAt: new Date().toISOString(),
      competencia: {
        year: periodRow.year,
        month: periodRow.month,
        start: periodRow.start_date,
        end: periodRow.end_date,
        periodId,
        status: periodRow.status,
      },
      empregador: {
        cnpj,
        razaoSocial: employer?.legal_name || employer?.name || '',
        ambiente: employer?.esocial_ambiente || 'PRODUCAO_RESTRITA',
      },
      warnings: warnings.length ? warnings : undefined,
      colaboradores,
    };
  },

  exportCsv(exportData: PayrollExportV1): string {
    const headers = [
      'cpf', 'pis', 'nome', 'horas_normais', 'he50', 'he100', 'noturno', 'atraso_h', 'faltas',
    ];
    const lines = [headers.join(',')];
    for (const c of exportData.colaboradores) {
      lines.push(
        [c.cpf, c.pis, `"${c.nome.replace(/"/g, '""')}"`, c.horasNormais, c.he50, c.he100, c.noturno, c.atraso, c.faltas].join(',')
      );
    }
    return lines.join('\n');
  },
};
