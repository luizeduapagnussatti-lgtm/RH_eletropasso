import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import { employeeService } from './employee.service';
import { timesheetService } from './timesheet.service';
import { validateCpf, validatePis } from '../utils/employeeCredentials';
import { isNonPunchingStaff } from '../utils/roles';
import { Employee } from '../types';

export interface PayrollReadinessGap {
  employeeId: string;
  employeeName: string;
  punchKey: string;
  missingCpf: boolean;
  missingPis: boolean;
  missingJoiningDate: boolean;
  missingTerminationDate: boolean;
  dayCount: number;
}

function resolveEmployee(employees: Employee[], key: string): Employee | undefined {
  return employees.find(e => e.id === key || e.employeeId === key);
}

export const payrollReadinessService = {
  async listGapsForPeriod(periodId: string): Promise<PayrollReadinessGap[]> {
    if (!isSupabaseConfigured()) return [];
    const days = await timesheetService.listDays(periodId);
    const employees = await employeeService.getEmployees();
    const byKey = new Map<string, number>();
    for (const d of days) {
      byKey.set(d.employeeId, (byKey.get(d.employeeId) || 0) + 1);
    }

    const gaps: PayrollReadinessGap[] = [];
    for (const [key, dayCount] of byKey) {
      const emp = resolveEmployee(employees, key);
      // ADMIN / HR / Diretoria do not punch — never treat as payroll gaps
      if (!emp || isNonPunchingStaff(emp.role) || emp.role === 'SUPER_ADMIN') continue;
      const cpfOk = emp.cpf ? validateCpf(emp.cpf).ok : false;
      const pisOk = emp.employeeId ? validatePis(emp.employeeId).ok : false;
      const joinOk = !!emp.joiningDate;
      const termOk = emp.status !== 'INACTIVE' || !!emp.terminationDate;
      if (cpfOk && pisOk && joinOk && termOk) continue;
      gaps.push({
        employeeId: emp.id || key,
        employeeName: emp.name || key,
        punchKey: emp.employeeId || key,
        missingCpf: !cpfOk,
        missingPis: !pisOk,
        missingJoiningDate: !joinOk,
        missingTerminationDate: !termOk,
        dayCount,
      });
    }
    return gaps.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  },

  exportGapsCsv(gaps: PayrollReadinessGap[]): string {
    const headers = [
      'employee_id',
      'name',
      'pis',
      'missing_cpf',
      'missing_pis',
      'missing_joining_date',
      'missing_termination_date',
      'days',
    ];
    const lines = [headers.join(',')];
    for (const g of gaps) {
      lines.push(
        [
          g.employeeId,
          `"${g.employeeName.replace(/"/g, '""')}"`,
          g.punchKey,
          g.missingCpf,
          g.missingPis,
          g.missingJoiningDate,
          g.missingTerminationDate,
          g.dayCount,
        ].join(',')
      );
    }
    return lines.join('\n');
  },
};
