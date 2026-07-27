import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient } from './api.client';
import { EsocialRubricInternalType, EsocialRubricMapping } from '../types';

const DEFAULT_RUBRICS: Array<Omit<EsocialRubricMapping, 'id' | 'organizationId'>> = [
  { internalType: 'REGULAR', rubricCode: '1000', description: 'Horas normais', active: true },
  { internalType: 'HE_50', rubricCode: '1200', description: 'Horas extras 50%', active: true },
  { internalType: 'HE_100', rubricCode: '1201', description: 'Horas extras 100%', active: true },
  { internalType: 'NIGHT', rubricCode: '1040', description: 'Adicional noturno', active: true },
  { internalType: 'ABSENCE', rubricCode: '9200', description: 'Faltas', active: true },
];

const mapRow = (r: any): EsocialRubricMapping => ({
  id: r.id,
  organizationId: r.organization_id,
  internalType: r.internal_type,
  rubricCode: r.rubric_code,
  description: r.description || '',
  active: !!r.active,
});

export const esocialRubricService = {
  async list(): Promise<EsocialRubricMapping[]> {
    if (!isSupabaseConfigured()) return DEFAULT_RUBRICS.map((d, i) => ({
      id: `default-${i}`,
      organizationId: '',
      ...d,
    }));
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];
    const { data, error } = await supabase
      .from('esocial_rubric_mappings')
      .select('*')
      .eq('organization_id', orgId)
      .order('internal_type');
    if (error) throw error;
    if (!data?.length) return DEFAULT_RUBRICS.map((d, i) => ({
      id: `default-${i}`,
      organizationId: orgId,
      ...d,
    }));
    return data.map(mapRow);
  },

  async listActive(): Promise<EsocialRubricMapping[]> {
    return (await this.list()).filter(r => r.active);
  },

  async saveAll(mappings: Array<{
    internalType: EsocialRubricInternalType;
    rubricCode: string;
    description: string;
    active: boolean;
  }>): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const orgId = apiClient.getOrganizationId();
    if (!orgId) throw new Error('No organization ID');

    for (const m of mappings) {
      const { error } = await supabase.from('esocial_rubric_mappings').upsert(
        {
          organization_id: orgId,
          internal_type: m.internalType,
          rubric_code: m.rubricCode.trim(),
          description: m.description.trim(),
          active: m.active,
          updated: new Date().toISOString(),
        },
        { onConflict: 'organization_id,internal_type' }
      );
      if (error) throw error;
    }
    apiClient.notify();
  },
};
