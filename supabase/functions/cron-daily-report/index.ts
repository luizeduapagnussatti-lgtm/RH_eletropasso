// OpenHR — Daily Attendance Report Cron
// Schedule: 0 23 * * * (daily 11 PM UTC)
//
// For each org with dailyReportEnabled in app_config:
//   - Counts PRESENT/LATE/ABSENT and approved leaves for org-local today.
//   - Sends localized email report to all ADMIN and HR profiles via Resend.
//   - Inserts a bell notification for each ADMIN/HR profile.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { dailyReportEmail, resolveLocale } from '../_shared/emailTemplates.ts';

const FROM_EMAIL = 'OpenHR <noreply@openhrapp.com>';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function toLocalDateStr(date: Date, tz: string): string {
  try {
    return date.toLocaleString('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

async function sendEmail(resendKey: string, to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) console.error(`[cron-daily-report] Resend ${res.status}: ${await res.text()}`);
  return res.ok;
}

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return jsonResponse(401, { success: false, message: 'Unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const admin = createClient(supabaseUrl, serviceKey);
  const now = new Date();

  const { data: orgs } = await admin
    .from('organizations')
    .select('id, name')
    .neq('subscription_status', 'SUSPENDED');

  let reportsSent = 0;

  for (const org of orgs ?? []) {
    if (org.name === '__SYSTEM__' || org.name === 'Platform') continue;

    const { data: cfgRow } = await admin
      .from('settings').select('value')
      .eq('organization_id', org.id).eq('key', 'app_config').maybeSingle();

    let cfg: Record<string, unknown> = {};
    try { cfg = cfgRow ? JSON.parse(cfgRow.value) : {}; } catch { continue; }
    if (!cfg.dailyReportEnabled) continue;

    const timezone = (cfg.timezone as string) || 'UTC';
    const dateStr = toLocalDateStr(now, timezone);

    const { data: attRows } = await admin
      .from('attendance').select('status')
      .eq('organization_id', org.id).eq('date', dateStr);

    let present = 0, late = 0, absent = 0;
    for (const row of attRows ?? []) {
      if (row.status === 'PRESENT') present++;
      else if (row.status === 'LATE') late++;
      else if (row.status === 'ABSENT') absent++;
    }

    const { count: onLeave } = await admin
      .from('leaves').select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id).eq('status', 'APPROVED')
      .lte('start_date', dateStr).gte('end_date', dateStr);

    const leaveCount = onLeave ?? 0;
    const total = present + late + absent;

    const { data: admins } = await admin
      .from('profiles').select('id, name, email')
      .eq('organization_id', org.id)
      .in('role', ['ADMIN', 'HR']);

    const { data: authData } = await admin.auth.admin.listUsers();
    const authMap = new Map(authData?.users?.map((u) => [u.id, u.email]) ?? []);

    const reportVars = {
      orgName: org.name,
      date: dateStr,
      present,
      late,
      absent,
      onLeave: leaveCount,
      total,
    };

    for (const adm of admins ?? []) {
      const locale = await resolveLocale(admin, org.id, adm.id);
      const { subject, html } = dailyReportEmail(locale, reportVars);

      await admin.from('notifications').insert({
        user_id: adm.id,
        organization_id: org.id,
        type: 'ATTENDANCE',
        title: subject,
        message: `${reportVars.present} | ${reportVars.late} | ${reportVars.absent} | ${reportVars.onLeave}`,
        is_read: false,
        priority: absent > 0 ? 'URGENT' : 'NORMAL',
        action_url: 'attendance',
      });

      if (!resendKey) continue;
      const email = adm.email || authMap.get(adm.id);
      if (!email) continue;

      if (await sendEmail(resendKey, email, subject, html)) {
        reportsSent++;
      }
    }
  }

  console.log(`[cron-daily-report] Done. reports_sent=${reportsSent}`);
  return jsonResponse(200, { success: true, reportsSent });
});
