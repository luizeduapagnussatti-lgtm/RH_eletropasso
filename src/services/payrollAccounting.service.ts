import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import { employeeService } from './employee.service';
import { payrollConsolidationService } from './payrollConsolidation.service';
import {
  PayrollAccountingHandoff,
  PayrollAccountingWorkflowStatus,
  PayrollPaymentSlip,
  PayrollSlipAckStatus,
} from '../types';

const mapHandoff = (r: Record<string, unknown>): PayrollAccountingHandoff => ({
  id: r.id as string,
  organizationId: r.organization_id as string,
  periodId: r.period_id as string,
  workflowStatus: r.workflow_status as PayrollAccountingWorkflowStatus,
  sentToAccountingAt: (r.sent_to_accounting_at as string) || undefined,
  sentBy: (r.sent_by as string) || undefined,
  folhaReceivedAt: (r.folha_received_at as string) || undefined,
  folhaReceivedBy: (r.folha_received_by as string) || undefined,
  closedAt: (r.closed_at as string) || undefined,
  notes: (r.notes as string) || undefined,
});

const mapSlip = (r: Record<string, unknown>, emp?: { name?: string; cpf?: string; employeeId?: string }): PayrollPaymentSlip => ({
  id: r.id as string,
  organizationId: r.organization_id as string,
  periodId: r.period_id as string,
  employeeId: r.employee_id as string,
  refRegularHours: Number(r.ref_regular_hours),
  refHe50Hours: Number(r.ref_he50_hours),
  refHe100Hours: Number(r.ref_he100_hours),
  refNightHours: Number(r.ref_night_hours),
  refLateHours: Number(r.ref_late_hours),
  refAbsenceHours: Number(r.ref_absence_hours),
  accHe50Hours: r.acc_he50_hours != null ? Number(r.acc_he50_hours) : undefined,
  accHe100Hours: r.acc_he100_hours != null ? Number(r.acc_he100_hours) : undefined,
  accNightHours: r.acc_night_hours != null ? Number(r.acc_night_hours) : undefined,
  accLateHours: r.acc_late_hours != null ? Number(r.acc_late_hours) : undefined,
  accAbsenceHours: r.acc_absence_hours != null ? Number(r.acc_absence_hours) : undefined,
  slipFilePath: (r.slip_file_path as string) || undefined,
  acknowledgmentStatus: r.acknowledgment_status as PayrollSlipAckStatus,
  signedAt: (r.signed_at as string) || undefined,
  correctionNotes: (r.correction_notes as string) || undefined,
  employeeName: emp?.name,
  employeeCpf: emp?.cpf,
  employeePis: emp?.employeeId,
});

export const payrollAccountingService = {
  async getHandoff(periodId: string): Promise<PayrollAccountingHandoff | null> {
    if (!isSupabaseConfigured()) return null;
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return null;
    const { data, error } = await supabase
      .from('payroll_accounting_handoffs')
      .select('*')
      .eq('organization_id', orgId)
      .eq('period_id', periodId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapHandoff(data) : null;
  },

  async listSlips(periodId: string): Promise<PayrollPaymentSlip[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];
    const { data, error } = await supabase
      .from('payroll_payment_slips')
      .select('*')
      .eq('organization_id', orgId)
      .eq('period_id', periodId)
      .order('created');
    if (error) throw error;
    const employees = await employeeService.getEmployees();
    return (data || []).map(r => mapSlip(r, employees.find(e => e.id === r.employee_id)));
  },

  async prepareSlipsFromConsolidation(periodId: string): Promise<PayrollPaymentSlip[]> {
    const consolidations = await payrollConsolidationService.buildForPeriod(periodId);
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    for (const c of consolidations) {
      const { error } = await supabase.from('payroll_payment_slips').upsert(
        {
          organization_id: orgId,
          period_id: periodId,
          employee_id: c.employeeId,
          ref_regular_hours: c.regularHours,
          ref_he50_hours: c.extraHours50,
          ref_he100_hours: c.extraHours100,
          ref_night_hours: c.nightHours,
          ref_late_hours: c.lateHours,
          ref_absence_hours: c.absenceHours,
          updated: new Date().toISOString(),
        },
        { onConflict: 'organization_id,period_id,employee_id' }
      );
      if (error) throw error;
    }
    apiClient.notify();
    return this.listSlips(periodId);
  },

  async sendToAccounting(periodId: string, userId: string, notes?: string): Promise<PayrollAccountingHandoff> {
    await this.prepareSlipsFromConsolidation(periodId);
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const payload = {
      organization_id: orgId,
      period_id: periodId,
      workflow_status: 'SENT_TO_ACCOUNTING' as PayrollAccountingWorkflowStatus,
      sent_to_accounting_at: new Date().toISOString(),
      sent_by: userId,
      notes: notes?.trim() || null,
      updated: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('payroll_accounting_handoffs')
      .upsert(payload, { onConflict: 'organization_id,period_id' })
      .select()
      .single();
    if (error) throw error;
    apiClient.notify();
    return mapHandoff(data);
  },

  async markFolhaReceived(periodId: string, userId: string): Promise<PayrollAccountingHandoff> {
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');
    const { data, error } = await supabase
      .from('payroll_accounting_handoffs')
      .upsert(
        {
          organization_id: orgId,
          period_id: periodId,
          workflow_status: 'ACK_COLLECTING',
          folha_received_at: new Date().toISOString(),
          folha_received_by: userId,
          updated: new Date().toISOString(),
        },
        { onConflict: 'organization_id,period_id' }
      )
      .select()
      .single();
    if (error) throw error;
    apiClient.notify();
    return mapHandoff(data);
  },

  async updateSlipAccountingValues(
    slipId: string,
    values: {
      accHe50Hours?: number;
      accHe100Hours?: number;
      accNightHours?: number;
      accLateHours?: number;
      accAbsenceHours?: number;
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('payroll_payment_slips')
      .update({ ...values, updated: new Date().toISOString() })
      .eq('id', slipId);
    if (error) throw error;
    apiClient.notify();
  },

  async uploadSlipFile(slipId: string, file: File): Promise<string> {
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const path = `${orgId}/${slipId}.${ext}`;
    const { error: upErr } = await supabase.storage.from('payroll-slips').upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { error } = await supabase
      .from('payroll_payment_slips')
      .update({ slip_file_path: path, updated: new Date().toISOString() })
      .eq('id', slipId);
    if (error) throw error;
    apiClient.notify();
    return path;
  },

  async signSlip(slipId: string): Promise<void> {
    const { error } = await supabase
      .from('payroll_payment_slips')
      .update({
        acknowledgment_status: 'SIGNED',
        signed_at: new Date().toISOString(),
        correction_notes: null,
        updated: new Date().toISOString(),
      })
      .eq('id', slipId);
    if (error) throw error;
    apiClient.notify();
  },

  async requestCorrection(slipId: string, notes: string): Promise<void> {
    const { error } = await supabase
      .from('payroll_payment_slips')
      .update({
        acknowledgment_status: 'CORRECTION_REQUESTED',
        correction_notes: notes.trim(),
        updated: new Date().toISOString(),
      })
      .eq('id', slipId);
    if (error) throw error;
    apiClient.notify();
  },

  async closePeriod(periodId: string): Promise<PayrollAccountingHandoff> {
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');
    const { data, error } = await supabase
      .from('payroll_accounting_handoffs')
      .update({
        workflow_status: 'CLOSED',
        closed_at: new Date().toISOString(),
        updated: new Date().toISOString(),
      })
      .eq('organization_id', orgId)
      .eq('period_id', periodId)
      .select()
      .single();
    if (error) throw error;
    apiClient.notify();
    return mapHandoff(data);
  },
};
