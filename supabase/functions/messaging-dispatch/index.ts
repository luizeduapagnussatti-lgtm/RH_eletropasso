// OpenHR / Eletropasso — Messaging dispatch (Evolution WhatsApp + Resend email)
// POST /functions/v1/messaging-dispatch
// Body: { action: 'send'|'batch'|'retry'|'health', ... }
// Auth: Bearer JWT — ADMIN/HR (send/batch/retry) or ADMIN/HR/MANAGER (health)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  announcementEmailHtml,
  evolutionHealthCheck,
  evolutionSendDocument,
  evolutionSendText,
  resendSendEmail,
  resolveRecipientPhone,
} from '../_shared/messagingAdapter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BATCH_DELAY_MS = 1000;
const MAX_BATCH_SIZE = 200;

type Channel = 'EMAIL' | 'WHATSAPP';

type DispatchItem = {
  channel: Channel;
  recipientProfileId?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  subject?: string;
  body: string;
  mediaBase64?: string;
  mediaFileName?: string;
  referenceType?: string;
  referenceId?: string;
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripBase64Prefix(b64: string): string {
  const idx = b64.indexOf('base64,');
  return idx >= 0 ? b64.slice(idx + 7) : b64;
}

async function assertAdminHr(
  authHeader: string | null,
  supabaseUrl: string,
  anonKey: string,
  serviceKey: string,
  allowManager = false,
) {
  if (!authHeader) return { error: jsonResponse(401, { success: false, message: 'Missing Authorization' }) };

  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await anonClient.auth.getUser();
  if (!user) return { error: jsonResponse(401, { success: false, message: 'Invalid token' }) };

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await admin.from('profiles').select('role, organization_id, name').eq('id', user.id).single();
  const allowed = allowManager
    ? ['ADMIN', 'HR', 'MANAGER'].includes(profile?.role ?? '')
    : ['ADMIN', 'HR'].includes(profile?.role ?? '');
  if (!allowed) {
    return { error: jsonResponse(403, { success: false, message: 'Insufficient role' }) };
  }
  return { user, profile, admin };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { success: false, message: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const fromEmail = Deno.env.get('MESSAGING_FROM_EMAIL') ?? 'Eletropasso RH <suporte@eletropasso.com.br>';
  const evolutionUrl = Deno.env.get('EVOLUTION_API_URL') ?? '';
  const evolutionKey = Deno.env.get('EVOLUTION_API_KEY') ?? '';
  const evolutionInstance = Deno.env.get('EVOLUTION_INSTANCE') ?? 'eletropasso';

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { success: false, message: 'Invalid JSON' });
  }

  const action = String(body.action ?? 'send');

  if (action === 'health') {
    const auth = await assertAdminHr(req.headers.get('Authorization'), supabaseUrl, anonKey, serviceKey, true);
    if ('error' in auth && auth.error) return auth.error;
    if (!evolutionUrl || !evolutionKey) {
      return jsonResponse(200, {
        success: false,
        evolution: { connected: false, error: 'EVOLUTION_API_URL/KEY not configured' },
        resend: { configured: !!resendKey },
      });
    }
    const health = await evolutionHealthCheck(evolutionUrl, evolutionKey, evolutionInstance);
    return jsonResponse(200, {
      success: health.connected,
      evolution: health,
      resend: { configured: !!resendKey },
      instance: evolutionInstance,
    });
  }

  const auth = await assertAdminHr(req.headers.get('Authorization'), supabaseUrl, anonKey, serviceKey);
  if ('error' in auth && auth.error) return auth.error;
  const { profile, admin } = auth as { profile: { organization_id: string; role: string }; admin: ReturnType<typeof createClient> };
  const orgId = profile.organization_id;

  const { data: orgRow } = await admin.from('organizations').select('name').eq('id', orgId).maybeSingle();
  const orgName = orgRow?.name ?? 'Eletropasso';

  const { data: messagingSetting } = await admin
    .from('settings')
    .select('value')
    .eq('organization_id', orgId)
    .eq('key', 'messaging_config')
    .maybeSingle();

  let emailEnabled = true;
  let whatsappEnabled = true;
  if (messagingSetting?.value) {
    try {
      const cfg = typeof messagingSetting.value === 'string'
        ? JSON.parse(messagingSetting.value)
        : messagingSetting.value;
      emailEnabled = cfg.emailEnabled !== false;
      whatsappEnabled = cfg.whatsappEnabled !== false;
    } catch { /* defaults */ }
  }

  async function processItem(item: DispatchItem, delayBefore = false): Promise<{ id: string; status: string; error?: string }> {
    if (delayBefore) await sleep(BATCH_DELAY_MS);

    const channel = item.channel;
    if (channel === 'EMAIL' && !emailEnabled) {
      const { data: row } = await admin.from('messaging_outbox').insert({
        organization_id: orgId,
        channel,
        recipient_profile_id: item.recipientProfileId || null,
        recipient: item.recipientEmail || '',
        subject: item.subject || null,
        body: item.body,
        media_file_name: item.mediaFileName || null,
        status: 'SKIPPED',
        error_message: 'Email channel disabled for org',
        reference_type: item.referenceType || null,
        reference_id: item.referenceId || null,
      }).select('id').single();
      return { id: row?.id ?? '', status: 'SKIPPED', error: 'Email channel disabled' };
    }
    if (channel === 'WHATSAPP' && !whatsappEnabled) {
      const { data: row } = await admin.from('messaging_outbox').insert({
        organization_id: orgId,
        channel,
        recipient_profile_id: item.recipientProfileId || null,
        recipient: item.recipientPhone || '',
        subject: item.subject || null,
        body: item.body,
        media_file_name: item.mediaFileName || null,
        status: 'SKIPPED',
        error_message: 'WhatsApp channel disabled for org',
        reference_type: item.referenceType || null,
        reference_id: item.referenceId || null,
      }).select('id').single();
      return { id: row?.id ?? '', status: 'SKIPPED', error: 'WhatsApp channel disabled' };
    }

    let recipient = '';
    let profileRow: { email?: string; mobile?: string; whatsapp_e164?: string; whatsapp_opt_in?: boolean; messaging_channel_pref?: string[] } | null = null;

    if (item.recipientProfileId) {
      const { data: p } = await admin
        .from('profiles')
        .select('email, mobile, whatsapp_e164, whatsapp_opt_in, messaging_channel_pref')
        .eq('id', item.recipientProfileId)
        .maybeSingle();
      profileRow = p;
    }

    if (channel === 'WHATSAPP') {
      if (profileRow && !profileRow.whatsapp_opt_in) {
        const { data: row } = await admin.from('messaging_outbox').insert({
          organization_id: orgId,
          channel,
          recipient_profile_id: item.recipientProfileId || null,
          recipient: item.recipientPhone || profileRow?.whatsapp_e164 || '',
          subject: item.subject || null,
          body: item.body,
          media_file_name: item.mediaFileName || null,
          status: 'SKIPPED',
          error_message: 'Recipient has not opted in to WhatsApp',
          reference_type: item.referenceType || null,
          reference_id: item.referenceId || null,
        }).select('id').single();
        return { id: row?.id ?? '', status: 'SKIPPED', error: 'No WhatsApp opt-in' };
      }
      const phone = resolveRecipientPhone(
        item.recipientPhone,
        profileRow?.mobile,
        profileRow?.whatsapp_e164,
      );
      if (!phone) {
        const { data: row } = await admin.from('messaging_outbox').insert({
          organization_id: orgId,
          channel,
          recipient_profile_id: item.recipientProfileId || null,
          recipient: '',
          subject: item.subject || null,
          body: item.body,
          media_file_name: item.mediaFileName || null,
          status: 'FAILED',
          error_message: 'No valid WhatsApp number',
          reference_type: item.referenceType || null,
          reference_id: item.referenceId || null,
        }).select('id').single();
        return { id: row?.id ?? '', status: 'FAILED', error: 'No valid WhatsApp number' };
      }
      recipient = phone;

      if (!evolutionUrl || !evolutionKey) {
        const { data: row } = await admin.from('messaging_outbox').insert({
          organization_id: orgId,
          channel,
          recipient_profile_id: item.recipientProfileId || null,
          recipient: phone,
          subject: item.subject || null,
          body: item.body,
          media_file_name: item.mediaFileName || null,
          status: 'FAILED',
          error_message: 'Evolution API not configured',
          reference_type: item.referenceType || null,
          reference_id: item.referenceId || null,
        }).select('id').single();
        return { id: row?.id ?? '', status: 'FAILED', error: 'Evolution not configured' };
      }

      let result;
      if (item.mediaBase64 && item.mediaFileName) {
        result = await evolutionSendDocument(
          evolutionUrl,
          evolutionKey,
          evolutionInstance,
          phone,
          stripBase64Prefix(item.mediaBase64),
          item.mediaFileName,
          item.body,
        );
      } else {
        result = await evolutionSendText(evolutionUrl, evolutionKey, evolutionInstance, phone, item.body);
      }

      const status = result.ok ? 'SENT' : 'FAILED';
      const { data: row } = await admin.from('messaging_outbox').insert({
        organization_id: orgId,
        channel,
        recipient_profile_id: item.recipientProfileId || null,
        recipient: phone,
        subject: item.subject || null,
        body: item.body,
        media_file_name: item.mediaFileName || null,
        status,
        error_message: result.error || null,
        sent_at: result.ok ? new Date().toISOString() : null,
        reference_type: item.referenceType || null,
        reference_id: item.referenceId || null,
      }).select('id').single();
      return { id: row?.id ?? '', status, error: result.error };
    }

    // EMAIL
    const email = item.recipientEmail || profileRow?.email || '';
    if (!email) {
      const { data: row } = await admin.from('messaging_outbox').insert({
        organization_id: orgId,
        channel: 'EMAIL',
        recipient_profile_id: item.recipientProfileId || null,
        recipient: '',
        subject: item.subject || null,
        body: item.body,
        media_file_name: item.mediaFileName || null,
        status: 'FAILED',
        error_message: 'No email address',
        reference_type: item.referenceType || null,
        reference_id: item.referenceId || null,
      }).select('id').single();
      return { id: row?.id ?? '', status: 'FAILED', error: 'No email' };
    }
    recipient = email;

    if (!resendKey) {
      const { data: row } = await admin.from('messaging_outbox').insert({
        organization_id: orgId,
        channel: 'EMAIL',
        recipient_profile_id: item.recipientProfileId || null,
        recipient: email,
        subject: item.subject || null,
        body: item.body,
        media_file_name: item.mediaFileName || null,
        status: 'FAILED',
        error_message: 'RESEND_API_KEY not configured',
        reference_type: item.referenceType || null,
        reference_id: item.referenceId || null,
      }).select('id').single();
      return { id: row?.id ?? '', status: 'FAILED', error: 'Resend not configured' };
    }

    const html = item.referenceType === 'announcement'
      ? announcementEmailHtml(item.subject || 'Comunicado', item.body, orgName)
      : `<div style="font-family:system-ui,sans-serif;line-height:1.6;">${item.body.replace(/\n/g, '<br/>')}</div>`;

    const attachment = item.mediaBase64 && item.mediaFileName
      ? { filename: item.mediaFileName, content: stripBase64Prefix(item.mediaBase64) }
      : undefined;

    const result = await resendSendEmail(
      resendKey,
      fromEmail,
      email,
      item.subject || 'Eletropasso RH',
      html,
      attachment,
    );

    const status = result.ok ? 'SENT' : 'FAILED';
    const { data: row } = await admin.from('messaging_outbox').insert({
      organization_id: orgId,
      channel: 'EMAIL',
      recipient_profile_id: item.recipientProfileId || null,
      recipient: email,
      subject: item.subject || null,
      body: item.body,
      media_file_name: item.mediaFileName || null,
      status,
      error_message: result.error || null,
      sent_at: result.ok ? new Date().toISOString() : null,
      reference_type: item.referenceType || null,
      reference_id: item.referenceId || null,
    }).select('id').single();
    return { id: row?.id ?? '', status, error: result.error };
  }

  if (action === 'retry') {
    const outboxId = String(body.outboxId ?? '');
    if (!outboxId) return jsonResponse(400, { success: false, message: 'outboxId required' });

    const { data: existing } = await admin
      .from('messaging_outbox')
      .select('*')
      .eq('id', outboxId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!existing) return jsonResponse(404, { success: false, message: 'Outbox entry not found' });

    const item: DispatchItem = {
      channel: existing.channel as Channel,
      recipientProfileId: existing.recipient_profile_id || undefined,
      recipientEmail: existing.channel === 'EMAIL' ? existing.recipient : undefined,
      recipientPhone: existing.channel === 'WHATSAPP' ? existing.recipient : undefined,
      subject: existing.subject || undefined,
      body: existing.body,
      mediaFileName: existing.media_file_name || undefined,
      referenceType: existing.reference_type || undefined,
      referenceId: existing.reference_id || undefined,
    };
    const result = await processItem(item);
    await admin.from('messaging_outbox').update({
      status: result.status,
      error_message: result.error || null,
      sent_at: result.status === 'SENT' ? new Date().toISOString() : null,
      updated: new Date().toISOString(),
    }).eq('id', outboxId);
    return jsonResponse(200, { success: result.status === 'SENT', result });
  }

  if (action === 'batch') {
    const items = (body.items as DispatchItem[]) ?? [];
    if (!items.length) return jsonResponse(400, { success: false, message: 'items required' });
    if (items.length > MAX_BATCH_SIZE) {
      return jsonResponse(400, { success: false, message: `Max ${MAX_BATCH_SIZE} items per batch` });
    }

    const results: Array<{ id: string; status: string; error?: string }> = [];
    for (let i = 0; i < items.length; i++) {
      results.push(await processItem(items[i]!, i > 0 && items[i]!.channel === 'WHATSAPP'));
    }
    const sent = results.filter((r) => r.status === 'SENT').length;
    const failed = results.filter((r) => r.status === 'FAILED').length;
    const skipped = results.filter((r) => r.status === 'SKIPPED').length;
    return jsonResponse(200, { success: sent > 0, sent, failed, skipped, results });
  }

  // single send
  const item = body as unknown as DispatchItem;
  if (!item.channel || !item.body) {
    return jsonResponse(400, { success: false, message: 'channel and body required' });
  }
  const result = await processItem(item);
  return jsonResponse(200, { success: result.status === 'SENT', result });
});
