// OpenHR — Reports Queue Processor Cron
// Schedule: */2 * * * * (every 2 minutes UTC)
//
// Drains reports_queue rows with status=PENDING, sends via Resend,
// updates each row to SENT or FAILED.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FROM_EMAIL = 'OpenHR <noreply@openhrapp.com>';
const BATCH_SIZE = 50;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function sendEmail(resendKey: string, to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${err}` };
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return jsonResponse(401, { success: false, message: 'Unauthorized' });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    return jsonResponse(500, { success: false, message: 'RESEND_API_KEY secret not configured' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);
  const now = new Date().toISOString();

  const { data: pendingRows, error: fetchError } = await admin
    .from('reports_queue')
    .select('id, recipient_email, subject, message')
    .eq('status', 'PENDING')
    .order('created', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) {
    return jsonResponse(500, { success: false, message: fetchError.message });
  }

  if (!pendingRows?.length) {
    return jsonResponse(200, { success: true, processed: 0, sent: 0, failed: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (const row of pendingRows) {
    const email = (row.recipient_email || '').trim();
    const subject = (row.subject || '').trim();
    const html = row.message || '';

    await admin
      .from('reports_queue')
      .update({ status: 'PROCESSING', updated: now })
      .eq('id', row.id);

    if (!email || !subject || !html) {
      failed++;
      await admin.from('reports_queue').update({
        status: 'FAILED',
        error_message: 'Missing recipient_email, subject, or message',
        updated: now,
      }).eq('id', row.id);
      continue;
    }

    const result = await sendEmail(resendKey, email, subject, html);
    if (result.ok) {
      sent++;
      await admin.from('reports_queue').update({
        status: 'SENT',
        sent_at: now,
        error_message: null,
        updated: now,
      }).eq('id', row.id);
    } else {
      failed++;
      await admin.from('reports_queue').update({
        status: 'FAILED',
        error_message: result.error ?? 'Send failed',
        updated: now,
      }).eq('id', row.id);
    }
  }

  console.log(`[cron-process-reports-queue] processed=${pendingRows.length} sent=${sent} failed=${failed}`);
  return jsonResponse(200, { success: true, processed: pendingRows.length, sent, failed });
});
