import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SupervisorInput = {
  id?: string;
  profileId?: string | null;
  code?: string;
  pis?: string | null;
  name?: string;
  password?: string;
  hasTechnicalPermission?: boolean;
  hasDatetimePermission?: boolean;
  hasPendrivePermission?: boolean;
  hasBobbinPermission?: boolean;
  isActive?: boolean;
};

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('CLOCK_SUPERVISOR_ENCRYPTION_KEY')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || secret.length < 16) {
    throw new Error('CLOCK_SUPERVISOR_ENCRYPTION_KEY is not configured');
  }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
}

async function encryptPassword(password: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(),
    encoder.encode(password),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    profileId: row.profile_id ?? undefined,
    code: row.code,
    pis: row.pis ?? undefined,
    name: row.name,
    hasPassword: Boolean(row.password_ciphertext),
    hasTechnicalPermission: row.has_technical_permission,
    hasDatetimePermission: row.has_datetime_permission,
    hasPendrivePermission: row.has_pendrive_permission,
    hasBobbinPermission: row.has_bobbin_permission,
    isActive: row.is_active,
    created: row.created,
    updated: row.updated,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Missing Authorization header' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await anonClient.auth.getUser();
  if (authError || !user) return json(401, { error: 'Invalid token' });

  const admin = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: caller } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();
  if (!caller || caller.role !== 'ADMIN' || !caller.organization_id) {
    return json(403, { error: 'Only organization ADMIN can manage clock supervisors' });
  }

  const organizationId = caller.organization_id as string;

  try {
    if (req.method === 'GET') {
      const [supervisorsResult, commandsResult] = await Promise.all([
        admin
          .from('clock_supervisors')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created'),
        admin
          .from('clock_supervisor_command_log')
          .select('id, action, status, supervisor_count, performed_by, error_message, created')
          .eq('organization_id', organizationId)
          .order('created', { ascending: false })
          .limit(10),
      ]);
      if (supervisorsResult.error) throw supervisorsResult.error;
      if (commandsResult.error) throw commandsResult.error;
      return json(200, {
        supervisors: (supervisorsResult.data ?? []).map(mapRow),
        commands: (commandsResult.data ?? []).map((row) => ({
          id: row.id,
          action: row.action,
          status: row.status,
          supervisorCount: row.supervisor_count,
          performedBy: row.performed_by ?? undefined,
          errorMessage: row.error_message ?? undefined,
          created: row.created,
        })),
      });
    }

    if (req.method === 'DELETE') {
      const id = new URL(req.url).searchParams.get('id');
      if (!id) return json(400, { error: 'Missing supervisor id' });
      const { error } = await admin
        .from('clock_supervisors')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);
      if (error) throw error;
      return json(200, { success: true });
    }

    if (req.method !== 'POST' && req.method !== 'PUT') {
      return json(405, { error: 'Method not allowed' });
    }

    const input = await req.json() as SupervisorInput;
    const code = String(input.code ?? '').trim();
    const pis = input.pis ? String(input.pis).replace(/\D/g, '') : null;
    const name = String(input.name ?? '').trim();
    const password = input.password?.trim();

    if (!/^\d{1,20}$/.test(code)) return json(400, { error: 'Supervisor code must be numeric' });
    if (!pis || !/^\d{12}$/.test(pis)) return json(400, { error: 'PIS must have 12 digits' });
    if (name.length < 2 || name.length > 120) return json(400, { error: 'Invalid supervisor name' });
    if (password && !/^\d{6}$/.test(password)) return json(400, { error: 'Password must have 6 digits' });

    const row: Record<string, unknown> = {
      organization_id: organizationId,
      profile_id: input.profileId || null,
      code,
      pis,
      name,
      has_technical_permission: input.hasTechnicalPermission ?? true,
      has_datetime_permission: input.hasDatetimePermission ?? true,
      has_pendrive_permission: input.hasPendrivePermission ?? true,
      has_bobbin_permission: input.hasBobbinPermission ?? false,
      is_active: input.isActive ?? true,
      updated_by: user.id,
      updated: new Date().toISOString(),
    };

    if (password) {
      row.password_ciphertext = await encryptPassword(password);
    }

    if (req.method === 'POST') {
      if (!password) return json(400, { error: 'Password is required' });
      row.created_by = user.id;
      const { data, error } = await admin
        .from('clock_supervisors')
        .insert(row)
        .select('*')
        .single();
      if (error) throw error;
      return json(201, { supervisor: mapRow(data) });
    }

    if (!input.id) return json(400, { error: 'Missing supervisor id' });
    const { data, error } = await admin
      .from('clock_supervisors')
      .update(row)
      .eq('id', input.id)
      .eq('organization_id', organizationId)
      .select('*')
      .single();
    if (error) throw error;
    return json(200, { supervisor: mapRow(data) });
  } catch (error) {
    console.error('[CLOCK-SUPERVISORS]', error);
    const message = error instanceof Error ? error.message : 'Clock supervisor operation failed';
    const status = message.includes('CLOCK_SUPERVISOR_LIMIT') ? 409 : 500;
    return json(status, { error: message });
  }
});
