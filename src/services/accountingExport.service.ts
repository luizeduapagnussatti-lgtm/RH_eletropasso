import { timesheetService } from './timesheet.service';
import { employeeService } from './employee.service';
import { payrollConsolidationService } from './payrollConsolidation.service';
import { normalizeCpf, normalizePis } from '../utils/employeeCredentials';
import { createStoreZip } from '../utils/zipStore';
import { TimesheetPeriod } from '../types';

function resolveEmployee(employees: Awaited<ReturnType<typeof employeeService.getEmployees>>, key: string) {
  return employees.find(e => e.id === key || e.employeeId === key);
}

export const accountingExportService = {
  async buildSummaryCsv(periodId: string): Promise<string> {
    let data = await payrollConsolidationService.buildExportV1(periodId).catch(async () => {
      await payrollConsolidationService.buildForPeriod(periodId);
      return payrollConsolidationService.buildExportV1(periodId);
    });
    return payrollConsolidationService.exportCsv(data);
  },

  async buildDetailCsv(periodId: string): Promise<string> {
    const days = await timesheetService.listDays(periodId);
    const employees = await employeeService.getEmployees();
    const headers = [
      'cpf', 'pis', 'nome', 'work_date', 'status',
      'expected_min', 'worked_min', 'late_min', 'overtime_min', 'night_min', 'absence_min',
    ];
    const lines = [headers.join(',')];
    for (const d of days) {
      const emp = resolveEmployee(employees, d.employeeId);
      lines.push(
        [
          normalizeCpf(emp?.cpf || ''),
          normalizePis(emp?.employeeId || ''),
          `"${(emp?.name || d.employeeId).replace(/"/g, '""')}"`,
          d.workDate,
          d.status,
          d.expectedMinutes,
          d.workedMinutes,
          d.lateMinutes,
          d.overtimeMinutes,
          d.nightMinutes,
          d.absenceMinutes,
        ].join(',')
      );
    }
    return lines.join('\n');
  },

  async buildAccountingZip(period: TimesheetPeriod): Promise<Blob> {
    const summary = await this.buildSummaryCsv(period.id);
    const detail = await this.buildDetailCsv(period.id);
    const readme = [
      'Pacote espelho de ponto — Eletropasso / OpenHR',
      `Competência: ${period.year}-${String(period.month).padStart(2, '0')}`,
      `Período: ${period.startDate} a ${period.endDate}`,
      '',
      'Arquivos:',
      '- resumo-contabilidade.csv → totais por colaborador (HE 50/100, noturno, atraso, faltas)',
      '- espelho-detalhado.csv → dias apurados com batidas consolidadas',
      '',
      'Fluxo: RH envia à contabilidade → contabilidade lança folha → devolve holerites → RH coleta ciência.',
    ].join('\n');

    return createStoreZip([
      { name: 'resumo-contabilidade.csv', content: summary },
      { name: 'espelho-detalhado.csv', content: detail },
      { name: 'LEIA-ME.txt', content: readme },
    ]);
  },
};
