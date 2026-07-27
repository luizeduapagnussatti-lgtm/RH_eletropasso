import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-payroll-api-key',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });

  const url = new URL(req.url);
  const periodId = url.searchParams.get('periodId');
  const organizationIdParam = url.searchParams.get('organizationId');
  const year = url.searchParams.get('year');
  const month = url.searchParams.get('month');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let organizationId = organizationIdParam;
  let resolvedPeriodId = periodId;

  if (!resolvedPeriodId && organizationId && year && month) {
    const { data: p } = await admin
      .from('timesheet_periods')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('year', Number(year))
      .eq('month', Number(month))
      .maybeSingle();
    if (!p) return json(404, { error: 'Period not found' });
    resolvedPeriodId = p.id;
  }

  if (!resolvedPeriodId) return json(400, { error: 'periodId or organizationId+year+month required' });

  const apiKey = req.headers.get('x-payroll-api-key') || '';
  const authHeader = req.headers.get('Authorization') || '';

  if (apiKey) {
    const keyHash = await hashKey(apiKey);
    const { data: keyRow } = await admin
      .from('org_api_keys')
      .select('organization_id, scopes, is_active')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .maybeSingle();
    if (!keyRow || !keyRow.scopes?.includes('payroll:read')) {
      return json(401, { error: 'Invalid API key' });
    }
    organizationId = keyRow.organization_id;
    await admin.from('org_api_keys').update({ last_used_at: new Date().toISOString() }).eq('key_hash', keyHash);
  } else if (authHeader.startsWith('Bearer ')) {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json(401, { error: 'Unauthorized' });
    const { data: profile } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (!profile || !['ADMIN', 'HR'].includes(profile.role)) {
      return json(403, { error: 'Forbidden' });
    }
    organizationId = profile.organization_id;
  } else {
    return json(401, { error: 'Authorization or x-payroll-api-key required' });
  }

  const { data: period, error: pErr } = await admin
    .from('timesheet_periods')
    .select('*')
    .eq('id', resolvedPeriodId)
    .maybeSingle();
  if (pErr || !period) return json(404, { error: 'Period not found' });
  if (period.organization_id !== organizationId) return json(403, { error: 'Organization mismatch' });
  if (!['APPROVED', 'LOCKED'].includes(period.status)) {
    return json(409, { error: 'Period must be APPROVED or LOCKED' });
  }

  const { data: org } = await admin
    .from('organizations')
    .select('cnpj, legal_name, name, esocial_ambiente')
    .eq('id', organizationId)
    .maybeSingle();
  if (!org?.cnpj) return json(409, { error: 'employer_cnpj_missing' });

  const { data: consolidations } = await admin
    .from('payroll_consolidations')
    .select('*')
    .eq('period_id', resolvedPeriodId)
    .eq('organization_id', organizationId);

  if (!consolidations?.length) {
    return json(404, { error: 'No payroll consolidations — build pre-payroll in UI first' });
  }

  const employeeIds = consolidations.map((c: { employee_id: string }) => c.employee_id);
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, name, cpf, employee_id')
    .in('id', employeeIds);
  const profMap = Object.fromEntries((profiles || []).map((p: { id: string }) => [p.id, p]));

  const { data: rubrics } = await admin
    .from('esocial_rubric_mappings')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true);

  const rubricMap = Object.fromEntries((rubrics || []).map((r: { internal_type: string }) => [r.internal_type, r]));

  const colaboradores = consolidations.map((c: Record<string, unknown>) => {
    const prof = profMap[c.employee_id as string] || {};
    const rubricas = [
      { tipo: 'REGULAR', codigo: rubricMap.REGULAR?.rubric_code || '1000', quantidadeHoras: Number(c.regular_hours) },
      { tipo: 'HE_50', codigo: rubricMap.HE_50?.rubric_code || '1200', quantidadeHoras: Number(c.extra_hours_50) },
      { tipo: 'HE_100', codigo: rubricMap.HE_100?.rubric_code || '1201', quantidadeHoras: Number(c.extra_hours_100) },
      { tipo: 'NIGHT', codigo: rubricMap.NIGHT?.rubric_code || '1040', quantidadeHoras: Number(c.night_hours || 0) },
      { tipo: 'ABSENCE', codigo: rubricMap.ABSENCE?.rubric_code || '9200', quantidadeHoras: Number(c.absence_hours) },
    ].filter((r: { quantidadeHoras: number }) => r.quantidadeHoras > 0);

    return {
      profileId: c.employee_id,
      cpf: prof.cpf || '',
      pis: prof.employee_id || '',
      nome: prof.name || '',
      horasNormais: Number(c.regular_hours),
      he50: Number(c.extra_hours_50),
      he100: Number(c.extra_hours_100),
      noturno: Number(c.night_hours || 0),
      faltas: Number(c.absence_hours),
      rubricas,
    };
  });

  return json(200, {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    competencia: {
      year: period.year,
      month: period.month,
      start: period.start_date,
      end: period.end_date,
      periodId: period.id,
      status: period.status,
    },
    empregador: {
      cnpj: org.cnpj,
      razaoSocial: org.legal_name || org.name,
      ambiente: org.esocial_ambiente || 'PRODUCAO_RESTRITA',
    },
    colaboradores,
  });
});
