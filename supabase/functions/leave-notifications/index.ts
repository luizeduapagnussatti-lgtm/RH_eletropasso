// OpenHR — Leave Notifications Webhook
// Trigger: Database webhook on public.leaves INSERT / UPDATE
// Auth: Authorization: Bearer <CRON_SECRET> (configure on the webhook)
//
// Sends localized leave emails on submission and status transitions.
// Simplified mirror of Others/pb_hooks/leave_notifications.pb.js.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  leaveEmail,
  resolveLocale,
  type LeaveEmailEvent,
  type LeaveEmailVars,
} from '../_shared/emailTemplates.ts';

const FROM_EMAIL = 'OpenHR <noreply@openhrapp.com>';

type LeaveRecord = {
  id: string;
  organization_id: string;
  employee_id: string;
  employee_name?: string | null;
  line_manager_id?: string | null;
  type: string;
  total_days?: number | string | null;
  start_date: string;
  end_date: string;
  reason?: string | null;
  status: string;
  manager_remarks?: string | null;
  approver_remarks?: string | null;
};

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: LeaveRecord | null;
  old_record: LeaveRecord | null;
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function dateOnly(value: string | null | undefined): string {
  return (value || '').split('T')[0].split(' ')[0];
}

async function sendEmail(resendKey: string, to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error(`[leave-notifications] Resend ${res.status}: ${await res.text()} → ${to}`);
    return false;
  }
  return true;
}

async function resolveRecipientEmail(
  admin: ReturnType<typeof createClient>,
  profileId: string | null | undefined,
  authMap: Map<string, string>,
): Promise<string | null> {
  if (!profileId) return null;
  const { data: profile } = await admin.from('profiles').select('email').eq('id', profileId).maybeSingle();
  return profile?.email || authMap.get(profileId) || null;
}

function baseLeaveVars(record: LeaveRecord): LeaveEmailVars {
  return {
    employeeName: record.employee_name || 'Employee',
    leaveType: record.type,
    totalDays: record.total_days ?? 1,
    startDate: dateOnly(record.start_date),
    endDate: dateOnly(record.end_date),
    reason: record.reason || undefined,
    status: record.status,
    managerRemarks: record.manager_remarks || undefined,
    approverRemarks: record.approver_remarks || undefined,
    rejectRemarks:
      (record.approver_remarks && record.approver_remarks.trim())
        ? record.approver_remarks
        : record.manager_remarks || undefined,
  };
}

async function dispatchLeaveEmail(
  admin: ReturnType<typeof createClient>,
  resendKey: string,
  orgId: string,
  profileId: string | null | undefined,
  authMap: Map<string, string>,
  event: LeaveEmailEvent,
  vars: LeaveEmailVars,
): Promise<boolean> {
  const email = await resolveRecipientEmail(admin, profileId, authMap);
  if (!email) return false;
  const locale = await resolveLocale(admin, orgId, profileId || undefined);
  const { subject, html } = leaveEmail(locale, event, vars);
  return sendEmail(resendKey, email, subject, html);
}

async function notifyAdminsHr(
  admin: ReturnType<typeof createClient>,
  resendKey: string,
  orgId: string,
  employeeProfileId: string,
  authMap: Map<string, string>,
  event: LeaveEmailEvent,
  vars: LeaveEmailVars,
): Promise<number> {
  const { data: staff } = await admin
    .from('profiles')
    .select('id')
    .eq('organization_id', orgId)
    .in('role', ['ADMIN', 'HR']);

  let sent = 0;
  for (const person of staff ?? []) {
    if (person.id === employeeProfileId) continue;
    if (await dispatchLeaveEmail(admin, resendKey, orgId, person.id, authMap, event, vars)) {
      sent++;
    }
  }
  return sent;
}

async function handleInsert(
  admin: ReturnType<typeof createClient>,
  resendKey: string,
  record: LeaveRecord,
  authMap: Map<string, string>,
): Promise<number> {
  const orgId = record.organization_id;
  const vars = baseLeaveVars(record);
  let sent = 0;

  if (await dispatchLeaveEmail(admin, resendKey, orgId, record.employee_id, authMap, 'submitted.employee', vars)) {
    sent++;
  }

  if (record.line_manager_id && record.status === 'PENDING_MANAGER') {
    if (await dispatchLeaveEmail(admin, resendKey, orgId, record.line_manager_id, authMap, 'submitted.manager', vars)) {
      sent++;
    }
  }

  sent += await notifyAdminsHr(admin, resendKey, orgId, record.employee_id, authMap, 'submitted.admin', vars);
  return sent;
}

async function handleUpdate(
  admin: ReturnType<typeof createClient>,
  resendKey: string,
  record: LeaveRecord,
  oldRecord: LeaveRecord | null,
  authMap: Map<string, string>,
): Promise<number> {
  const oldStatus = oldRecord?.status;
  const status = record.status;
  if (!status || oldStatus === status) return 0;

  const orgId = record.organization_id;
  const vars = baseLeaveVars(record);
  let sent = 0;

  if (status === 'PENDING_HR') {
    sent += await notifyAdminsHr(admin, resendKey, orgId, record.employee_id, authMap, 'pendingHr.hr', vars);
    if (await dispatchLeaveEmail(admin, resendKey, orgId, record.employee_id, authMap, 'pendingHr.employee', vars)) {
      sent++;
    }
    return sent;
  }

  if (status === 'APPROVED') {
    if (await dispatchLeaveEmail(admin, resendKey, orgId, record.employee_id, authMap, 'approved.employee', vars)) {
      sent++;
    }
    if (record.line_manager_id) {
      if (await dispatchLeaveEmail(admin, resendKey, orgId, record.line_manager_id, authMap, 'approved.manager', vars)) {
        sent++;
      }
    }
    sent += await notifyAdminsHr(admin, resendKey, orgId, record.employee_id, authMap, 'approved.admin', vars);
    return sent;
  }

  if (status === 'REJECTED') {
    if (await dispatchLeaveEmail(admin, resendKey, orgId, record.employee_id, authMap, 'rejected.employee', vars)) {
      sent++;
    }
    if (record.line_manager_id) {
      if (await dispatchLeaveEmail(admin, resendKey, orgId, record.line_manager_id, authMap, 'rejected.manager', vars)) {
        sent++;
      }
    }
    sent += await notifyAdminsHr(admin, resendKey, orgId, record.employee_id, authMap, 'rejected.admin', vars);
    return sent;
  }

  return sent;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { success: false, message: 'Method not allowed' });
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return jsonResponse(401, { success: false, message: 'Unauthorized' });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    return jsonResponse(500, { success: false, message: 'RESEND_API_KEY secret not configured' });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { success: false, message: 'Invalid JSON body' });
  }

  if (payload.table !== 'leaves' || payload.schema !== 'public') {
    return jsonResponse(200, { success: true, skipped: true, reason: 'Not a public.leaves event' });
  }

  const record = payload.record;
  if (!record) {
    return jsonResponse(200, { success: true, skipped: true, reason: 'No record in payload' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 10000 });
  const authMap = new Map(authData?.users?.map((u) => [u.id, u.email ?? '']) ?? []);

  let emailsSent = 0;
  if (payload.type === 'INSERT') {
    emailsSent = await handleInsert(admin, resendKey, record, authMap);
  } else if (payload.type === 'UPDATE') {
    emailsSent = await handleUpdate(admin, resendKey, record, payload.old_record, authMap);
  }

  console.log(`[leave-notifications] ${payload.type} leave=${record.id} status=${record.status} emails_sent=${emailsSent}`);
  return jsonResponse(200, { success: true, emailsSent });
});
