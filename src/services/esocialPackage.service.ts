import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import { payrollConsolidationService, PayrollExportV1 } from './payrollConsolidation.service';
import { esocialXmlService } from './esocialXml.service';
import { timesheetService } from './timesheet.service';
import { createStoreZip } from '../utils/zipStore';
import { EsocialEventStatus } from '../types';

export const esocialPackageService = {
  async generateAndStoreS1200(periodId: string): Promise<{
    eventId: string;
    xml: string;
    validationOk: boolean;
    errors: string[];
  }> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    const exportData = await payrollConsolidationService.buildExportV1(periodId);
    const { ok, errors, xml } = esocialXmlService.buildS1200XmlDraft(exportData);

    const { data, error } = await supabase
      .from('esocial_events')
      .insert({
        organization_id: orgId,
        period_id: periodId,
        event_type: 'S-1200',
        payload: exportData as unknown as Record<string, unknown>,
        xml_content: xml,
        validation_errors: errors,
        status: ok ? 'VALIDATED' : 'ERROR',
      })
      .select('id')
      .single();
    if (error) throw error;

    return { eventId: data.id, xml, validationOk: ok, errors };
  },

  async buildZipPackage(periodId: string): Promise<Blob> {
    const exportData = await payrollConsolidationService.buildExportV1(periodId);
    const { xml, errors } = esocialXmlService.buildS1200XmlDraft(exportData);
    const csv = payrollConsolidationService.exportCsv(exportData);
    const timesheetCsv = await timesheetService.exportPeriodCsv(periodId);

    const meta = {
      packageVersion: '1.0',
      generatedAt: new Date().toISOString(),
      periodId,
      validationErrors: errors,
      warnings: exportData.warnings,
    };

    return createStoreZip([
      { name: 'pre-folha.json', content: JSON.stringify(exportData, null, 2) },
      { name: 'pre-folha.csv', content: csv },
      { name: 'espelho-ptrp.csv', content: timesheetCsv },
      { name: 'S-1200-rascunho.xml', content: xml },
      { name: 'manifest.json', content: JSON.stringify(meta, null, 2) },
    ]);
  },

  async markSentToAccountant(eventId: string): Promise<void> {
    const { error } = await supabase
      .from('esocial_events')
      .update({ status: 'SENT_TO_ACCOUNTANT' as EsocialEventStatus, updated: new Date().toISOString() })
      .eq('id', eventId);
    if (error) throw error;
    apiClient.notify();
  },

  async listEventsForPeriod(periodId: string) {
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];
    const { data, error } = await supabase
      .from('esocial_events')
      .select('*')
      .eq('organization_id', orgId)
      .eq('period_id', periodId)
      .order('created', { ascending: false });
    if (error) throw error;
    return data || [];
  },
};
