// OpenHR — Localized email templates for Supabase Edge Functions.
// Strings mirror src/locales/{pt-BR,en}/emails.json (pt-BR default, en fallback).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type EmailLocale = 'pt-BR' | 'en';

export type LeaveEmailEvent =
  | 'submitted.employee'
  | 'submitted.manager'
  | 'submitted.admin'
  | 'pendingHr.hr'
  | 'pendingHr.employee'
  | 'approved.employee'
  | 'approved.manager'
  | 'approved.admin'
  | 'rejected.employee'
  | 'rejected.manager'
  | 'rejected.admin';

export type ReviewEmailEvent = 'cycleOpen' | 'cycleClosed' | 'deadlineReminder';

export interface DailyReportVars {
  orgName: string;
  date: string;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  total: number;
}

export interface LeaveEmailVars {
  employeeName: string;
  leaveType: string;
  totalDays: string | number;
  startDate: string;
  endDate: string;
  reason?: string;
  status?: string;
  pendingLabel?: string;
  managerRemarks?: string;
  approverRemarks?: string;
  rejectRemarks?: string;
}

export interface ReviewEmailVars {
  cycleName: string;
  recipientName?: string;
  daysLeft?: number | string;
  actionHint?: string;
}

type StringRecord = Record<string, string>;

const PT_BR = {
  dailyReport: {
    subject: 'Relatório diário de ponto — {{date}} — {{orgName}}',
    title: 'Relatório diário de ponto',
    labelOrganization: 'Organização',
    labelDate: 'Data',
    labelStatus: 'Status',
    labelCount: 'Quantidade',
    labelPresent: 'Presentes',
    labelLate: 'Atrasados',
    labelAbsent: 'Ausentes',
    labelOnLeave: 'Em licença',
    labelTotal: 'Total registrado',
    footer: 'Relatório automático diário do OpenHR.',
  },
  leave: {
    details: {
      employee: 'Colaborador',
      leaveType: 'Tipo de licença',
      duration: 'Duração',
      daysUnit: 'dia(s)',
      from: 'De',
      to: 'Até',
      reason: 'Motivo',
      notProvided: 'Não informado',
    },
    submitted: {
      employeeSubject: 'Solicitação de licença enviada: {{leaveType}}',
      employeeBody:
        '<h2>Solicitação recebida</h2><p>Olá <b>{{employeeName}}</b>,</p><p>Sua solicitação de licença foi enviada e está <b>{{pendingLabel}}</b>.</p>{{detailsTable}}<p style="color:#6b7280;font-size:13px;">Você receberá outro e-mail quando o status mudar.</p>',
      managerSubject: 'Ação necessária: licença {{leaveType}} — {{employeeName}}',
      managerBody:
        '<h2>Aprovação de licença necessária</h2><p><b>{{employeeName}}</b> enviou uma solicitação de licença que requer sua aprovação.</p>{{detailsTable}}<p>Acesse o <b>portal OpenHR</b> para aprovar ou recusar.</p>',
      adminSubject: 'Nova solicitação de licença: {{employeeName}} — {{leaveType}}',
      adminBody:
        '<h2>Nova solicitação de licença</h2><p>Uma nova solicitação foi enviada na sua organização.</p>{{detailsTable}}<p>Status atual: <b>{{status}}</b></p>',
      pendingManager: 'aguardando aprovação do gestor',
      pendingHr: 'aguardando análise do RH',
    },
    pendingHr: {
      hrSubject: 'Aprovação do RH necessária: {{employeeName}} — {{leaveType}}',
      hrBody:
        '<h2>Gestor aprovou — análise do RH necessária</h2><p>A solicitação de <b>{{employeeName}}</b> foi <b style="color:#f59e0b;">aprovada pelo gestor</b> e aguarda sua decisão final.</p>{{detailsTable}}<p><b>Observações do gestor:</b> {{managerRemarks}}</p><p>Acesse o <b>portal OpenHR</b> para aprovar ou recusar.</p>',
      employeeSubject: 'Atualização: gestor aprovou — aguardando RH',
      employeeBody:
        '<h2>Gestor aprovou sua licença</h2><p>Olá <b>{{employeeName}}</b>,</p><p>Sua solicitação foi <b style="color:#f59e0b;">aprovada pelo gestor</b> e aguarda aprovação final do RH.</p>{{detailsTable}}<p><b>Observações do gestor:</b> {{managerRemarks}}</p><p style="color:#6b7280;font-size:13px;">Você receberá outro e-mail quando o RH decidir.</p>',
    },
    approved: {
      employeeSubject: 'Licença aprovada: {{leaveType}} ({{startDate}} a {{endDate}})',
      employeeBody:
        '<h2>Solicitação aprovada</h2><p>Olá <b>{{employeeName}}</b>,</p><p>Sua solicitação de licença foi <b style="color:#10b981;">totalmente aprovada</b>.</p>{{detailsTable}}<p><b>Observações do gestor:</b> {{managerRemarks}}</p><p><b>Observações do RH:</b> {{approverRemarks}}</p><p style="color:#6b7280;font-size:13px;">Bom descanso!</p>',
      managerSubject: 'Licença aprovada (final): {{employeeName}} — {{leaveType}}',
      managerBody:
        '<h2>Licença aprovada — decisão final</h2><p>A solicitação de <b>{{employeeName}}</b> recebeu <b style="color:#10b981;">aprovação final do RH</b>.</p>{{detailsTable}}<p><b>Observações do RH:</b> {{approverRemarks}}</p>',
      adminSubject: 'Licença aprovada: {{employeeName}} — {{leaveType}}',
      adminBody:
        '<h2>Solicitação totalmente aprovada</h2><p>Esta solicitação de licença foi totalmente aprovada.</p>{{detailsTable}}<p><b>Observações do RH:</b> {{approverRemarks}}</p>',
    },
    rejected: {
      employeeSubject: 'Licença recusada: {{leaveType}} ({{startDate}})',
      employeeBody:
        '<h2>Solicitação recusada</h2><p>Olá <b>{{employeeName}}</b>,</p><p>Sua solicitação de licença foi <b style="color:#ef4444;">recusada</b>.</p>{{detailsTable}}<p><b>Observações do gestor:</b> {{managerRemarks}}</p><p><b>Observações do RH:</b> {{approverRemarks}}</p><p style="color:#6b7280;font-size:13px;">Em caso de dúvidas, fale com seu gestor ou RH.</p>',
      managerSubject: 'Licença recusada: {{employeeName}} — {{leaveType}}',
      managerBody:
        '<h2>Licença recusada — decisão final</h2><p>A solicitação de <b>{{employeeName}}</b> foi <b style="color:#ef4444;">recusada</b>.</p>{{detailsTable}}<p><b>Motivo:</b> {{rejectRemarks}}</p>',
      adminSubject: 'Licença recusada: {{employeeName}} — {{leaveType}}',
      adminBody:
        '<h2>Solicitação recusada</h2><p>A solicitação de licença abaixo foi recusada.</p>{{detailsTable}}<p><b>Motivo:</b> {{rejectRemarks}}</p>',
    },
    noRemarks: 'Sem observações',
  },
  review: {
    cycleOpen: {
      subject: 'Ciclo de avaliação aberto: {{cycleName}}',
      body:
        '<h2>Ciclo de avaliação aberto</h2><p>Olá <b>{{recipientName}}</b>,</p><p>O ciclo <b>{{cycleName}}</b> está aberto. {{actionHint}}</p>',
    },
    cycleClosed: {
      subject: 'Ciclo de avaliação encerrado: {{cycleName}}',
      body:
        '<h2>Ciclo de avaliação encerrado</h2><p>O ciclo <b>{{cycleName}}</b> foi encerrado. {{actionHint}}</p>',
    },
    deadlineReminder: {
      subject: 'Lembrete: prazo da avaliação em {{daysLeft}} dia(s) — {{cycleName}}',
      body:
        '<h2>Lembrete de prazo</h2><p>Olá <b>{{recipientName}}</b>,</p><p>Faltam <b>{{daysLeft}}</b> dia(s) para o prazo do ciclo <b>{{cycleName}}</b>. {{actionHint}}</p>',
    },
    actionHintEmployee: 'Conclua sua autoavaliação no portal OpenHR.',
    actionHintManager: 'Revise as avaliações pendentes da sua equipe.',
    actionHintHr: 'Acompanhe o andamento das avaliações na organização.',
  },
} as const;

const EN = {
  dailyReport: {
    subject: 'Daily Attendance Report — {{date}} — {{orgName}}',
    title: 'Daily Attendance Report',
    labelOrganization: 'Organization',
    labelDate: 'Date',
    labelStatus: 'Status',
    labelCount: 'Count',
    labelPresent: 'Present',
    labelLate: 'Late',
    labelAbsent: 'Absent',
    labelOnLeave: 'On Leave',
    labelTotal: 'Total Tracked',
    footer: 'Automated daily report from OpenHR.',
  },
  leave: {
    details: {
      employee: 'Employee',
      leaveType: 'Leave Type',
      duration: 'Duration',
      daysUnit: 'Day(s)',
      from: 'From',
      to: 'To',
      reason: 'Reason',
      notProvided: 'Not provided',
    },
    submitted: {
      employeeSubject: 'Leave Application Submitted: {{leaveType}}',
      employeeBody:
        '<h2>Leave Application Received</h2><p>Hi <b>{{employeeName}}</b>,</p><p>Your leave request has been submitted and is now <b>{{pendingLabel}}</b>.</p>{{detailsTable}}<p style="color:#6b7280;font-size:13px;">You will receive another email when the status changes.</p>',
      managerSubject: 'Action Required: {{leaveType}} Leave — {{employeeName}}',
      managerBody:
        '<h2>Leave Approval Required</h2><p><b>{{employeeName}}</b> has submitted a leave request that requires your approval.</p>{{detailsTable}}<p>Please log in to the <b>OpenHR portal</b> to Approve or Reject this request.</p>',
      adminSubject: 'New Leave Request: {{employeeName}} — {{leaveType}}',
      adminBody:
        '<h2>New Leave Application</h2><p>A new leave request has been submitted in your organisation.</p>{{detailsTable}}<p>Current Status: <b>{{status}}</b></p>',
      pendingManager: 'pending manager review',
      pendingHr: 'pending HR review',
    },
    pendingHr: {
      hrSubject: 'HR Approval Required: {{employeeName}} — {{leaveType}}',
      hrBody:
        '<h2>Manager Approved — HR Review Required</h2><p>The leave request for <b>{{employeeName}}</b> has been <b style="color:#f59e0b;">approved by their manager</b> and awaits your final decision.</p>{{detailsTable}}<p><b>Manager Remarks:</b> {{managerRemarks}}</p><p>Please log in to the <b>OpenHR portal</b> to approve or reject.</p>',
      employeeSubject: 'Leave Update: Manager Approved — Pending HR Review',
      employeeBody:
        '<h2>Manager Approved Your Leave</h2><p>Hi <b>{{employeeName}}</b>,</p><p>Your leave request has been <b style="color:#f59e0b;">approved by your manager</b> and is now pending final HR approval.</p>{{detailsTable}}<p><b>Manager Remarks:</b> {{managerRemarks}}</p><p style="color:#6b7280;font-size:13px;">You will receive another email once HR makes a final decision.</p>',
    },
    approved: {
      employeeSubject: 'Leave Approved: {{leaveType}} ({{startDate}} to {{endDate}})',
      employeeBody:
        '<h2>Leave Request Approved</h2><p>Hi <b>{{employeeName}}</b>,</p><p>Your leave request has been <b style="color:#10b981;">fully approved</b>.</p>{{detailsTable}}<p><b>Manager Remarks:</b> {{managerRemarks}}</p><p><b>HR/Admin Remarks:</b> {{approverRemarks}}</p><p style="color:#6b7280;font-size:13px;">Enjoy your time off!</p>',
      managerSubject: 'Leave Approved (Final): {{employeeName}} — {{leaveType}}',
      managerBody:
        '<h2>Leave Approved — Final Decision</h2><p>The leave request you reviewed for <b>{{employeeName}}</b> has received <b style="color:#10b981;">final HR/Admin approval</b>.</p>{{detailsTable}}<p><b>HR/Admin Remarks:</b> {{approverRemarks}}</p>',
      adminSubject: 'Leave Approved: {{employeeName}} — {{leaveType}}',
      adminBody:
        '<h2>Leave Request — Fully Approved</h2><p>This leave request has been fully approved.</p>{{detailsTable}}<p><b>HR/Admin Remarks:</b> {{approverRemarks}}</p>',
    },
    rejected: {
      employeeSubject: 'Leave Rejected: {{leaveType}} ({{startDate}})',
      employeeBody:
        '<h2>Leave Request Rejected</h2><p>Hi <b>{{employeeName}}</b>,</p><p>Your leave request has been <b style="color:#ef4444;">rejected</b>.</p>{{detailsTable}}<p><b>Manager Remarks:</b> {{managerRemarks}}</p><p><b>HR/Admin Remarks:</b> {{approverRemarks}}</p><p style="color:#6b7280;font-size:13px;">If you have questions, please contact your manager or HR department.</p>',
      managerSubject: 'Leave Rejected: {{employeeName}} — {{leaveType}}',
      managerBody:
        '<h2>Leave Rejected — Final Decision</h2><p>The leave request for <b>{{employeeName}}</b> has been <b style="color:#ef4444;">rejected</b>.</p>{{detailsTable}}<p><b>Rejection Reason:</b> {{rejectRemarks}}</p>',
      adminSubject: 'Leave Rejected: {{employeeName}} — {{leaveType}}',
      adminBody:
        '<h2>Leave Request — Rejected</h2><p>The following leave request has been rejected.</p>{{detailsTable}}<p><b>Rejection Reason:</b> {{rejectRemarks}}</p>',
    },
    noRemarks: 'No remarks',
  },
  review: {
    cycleOpen: {
      subject: 'Performance Review Cycle Open: {{cycleName}}',
      body:
        '<h2>Review Cycle Open</h2><p>Hi <b>{{recipientName}}</b>,</p><p>Review cycle <b>{{cycleName}}</b> is now open. {{actionHint}}</p>',
    },
    cycleClosed: {
      subject: 'Performance Review Cycle Closed: {{cycleName}}',
      body:
        '<h2>Review Cycle Closed</h2><p>Review cycle <b>{{cycleName}}</b> has closed. {{actionHint}}</p>',
    },
    deadlineReminder: {
      subject: 'Reminder: review deadline in {{daysLeft}} day(s) — {{cycleName}}',
      body:
        '<h2>Review Deadline Reminder</h2><p>Hi <b>{{recipientName}}</b>,</p><p>You have <b>{{daysLeft}}</b> day(s) left before the deadline for cycle <b>{{cycleName}}</b>. {{actionHint}}</p>',
    },
    actionHintEmployee: 'Please complete your self-assessment in the OpenHR portal.',
    actionHintManager: 'Please review pending assessments for your team.',
    actionHintHr: 'Monitor review progress across your organization.',
  },
} as const;

const CATALOG = { 'pt-BR': PT_BR, en: EN } as const;

function normalizeLocale(raw: unknown): EmailLocale {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'en' || value === 'en-us' || value === 'en_us') return 'en';
  return 'pt-BR';
}

function catalogFor(locale: EmailLocale) {
  return CATALOG[locale] ?? CATALOG['pt-BR'];
}

export function interpolate(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function buildLeaveDetailsTable(locale: EmailLocale, vars: LeaveEmailVars): string {
  const d = catalogFor(locale).leave.details;
  const reason = vars.reason?.trim() || d.notProvided;
  const rows = [
    [d.employee, vars.employeeName],
    [d.leaveType, vars.leaveType],
    [d.duration, `${vars.totalDays} ${d.daysUnit}`],
    [d.from, vars.startDate],
    [d.to, vars.endDate],
    [d.reason, reason],
  ];
  const tr = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;"><b>${label}</b></td><td style="padding:8px 12px;border:1px solid #e5e7eb;">${value}</td></tr>`,
    )
    .join('');
  return `<table style="border-collapse:collapse;margin:12px 0;">${tr}</table>`;
}

function leaveTemplateKeys(event: LeaveEmailEvent): { subjectKey: string; bodyKey: string; group: keyof typeof PT_BR.leave } {
  const [group, role] = event.split('.') as [keyof typeof PT_BR.leave, string];
  const prefix = role === 'employee' ? 'employee' : role === 'manager' ? 'manager' : role === 'admin' ? 'admin' : 'hr';
  return {
    group,
    subjectKey: `${prefix}Subject`,
    bodyKey: `${prefix}Body`,
  };
}

export async function resolveLocale(
  admin: SupabaseClient,
  orgId?: string | null,
  profileId?: string | null,
): Promise<EmailLocale> {
  if (profileId) {
    let prefQuery = admin
      .from('settings')
      .select('value')
      .eq('key', `notification_prefs_${profileId}`);
    if (orgId) prefQuery = prefQuery.eq('organization_id', orgId);
    const { data: prefRow } = await prefQuery.maybeSingle();
    if (prefRow?.value) {
      try {
        const prefs = JSON.parse(prefRow.value) as { locale?: string; language?: string };
        const fromPrefs = prefs.locale || prefs.language;
        if (fromPrefs) return normalizeLocale(fromPrefs);
      } catch {
        // ignore malformed prefs
      }
    }
  }

  if (orgId) {
    const { data: cfgRow } = await admin
      .from('settings')
      .select('value')
      .eq('organization_id', orgId)
      .eq('key', 'app_config')
      .maybeSingle();
    if (cfgRow?.value) {
      try {
        const cfg = JSON.parse(cfgRow.value) as { emailLocale?: string; locale?: string; language?: string };
        const fromCfg = cfg.emailLocale || cfg.locale || cfg.language;
        if (fromCfg) return normalizeLocale(fromCfg);
      } catch {
        // ignore malformed config
      }
    }
  }

  return 'pt-BR';
}

export function dailyReportEmail(
  locale: EmailLocale,
  vars: DailyReportVars,
): { subject: string; html: string } {
  const t = catalogFor(locale).dailyReport;
  const subject = interpolate(t.subject, vars);
  const html = `<h2>${t.title}</h2>
<p><strong>${t.labelOrganization}:</strong> ${vars.orgName}</p>
<p><strong>${t.labelDate}:</strong> ${vars.date}</p>
<table style="border-collapse:collapse;margin-top:16px;">
  <tr style="background:#f8f9fa;">
    <th style="padding:12px;border:1px solid #ddd;text-align:left;">${t.labelStatus}</th>
    <th style="padding:12px;border:1px solid #ddd;text-align:center;">${t.labelCount}</th>
  </tr>
  <tr><td style="padding:12px;border:1px solid #ddd;color:#10b981;">${t.labelPresent}</td><td style="padding:12px;border:1px solid #ddd;text-align:center;">${vars.present}</td></tr>
  <tr><td style="padding:12px;border:1px solid #ddd;color:#f59e0b;">${t.labelLate}</td><td style="padding:12px;border:1px solid #ddd;text-align:center;">${vars.late}</td></tr>
  <tr><td style="padding:12px;border:1px solid #ddd;color:#ef4444;">${t.labelAbsent}</td><td style="padding:12px;border:1px solid #ddd;text-align:center;">${vars.absent}</td></tr>
  <tr><td style="padding:12px;border:1px solid #ddd;color:#3b82f6;">${t.labelOnLeave}</td><td style="padding:12px;border:1px solid #ddd;text-align:center;">${vars.onLeave}</td></tr>
  <tr style="background:#f8f9fa;"><td style="padding:12px;border:1px solid #ddd;"><strong>${t.labelTotal}</strong></td><td style="padding:12px;border:1px solid #ddd;text-align:center;"><strong>${vars.total}</strong></td></tr>
</table>
<p style="margin-top:16px;color:#6b7280;font-size:12px;">${t.footer}</p>`;
  return { subject, html };
}

export function leaveEmail(
  locale: EmailLocale,
  event: LeaveEmailEvent,
  vars: LeaveEmailVars,
): { subject: string; html: string } {
  const cat = catalogFor(locale);
  const { group, subjectKey, bodyKey } = leaveTemplateKeys(event);
  const groupTemplates = cat.leave[group] as StringRecord;
  const detailsTable = buildLeaveDetailsTable(locale, vars);
  const merged: Record<string, string | number | undefined> = {
    ...vars,
    detailsTable,
    managerRemarks: vars.managerRemarks || cat.leave.noRemarks,
    approverRemarks: vars.approverRemarks || cat.leave.noRemarks,
    rejectRemarks: vars.rejectRemarks || vars.approverRemarks || vars.managerRemarks || cat.leave.noRemarks,
    pendingLabel:
      vars.pendingLabel ||
      (vars.status === 'PENDING_HR' ? cat.leave.submitted.pendingHr : cat.leave.submitted.pendingManager),
  };
  return {
    subject: interpolate(groupTemplates[subjectKey] ?? '', merged),
    html: interpolate(groupTemplates[bodyKey] ?? '', merged),
  };
}

export function reviewEmail(
  locale: EmailLocale,
  event: ReviewEmailEvent,
  vars: ReviewEmailVars,
): { subject: string; html: string } {
  const t = catalogFor(locale).review[event];
  return {
    subject: interpolate(t.subject, vars),
    html: interpolate(t.body, vars),
  };
}

export function reviewActionHint(
  locale: EmailLocale,
  role: 'employee' | 'manager' | 'hr',
): string {
  const hints = catalogFor(locale).review;
  if (role === 'manager') return hints.actionHintManager;
  if (role === 'hr') return hints.actionHintHr;
  return hints.actionHintEmployee;
}
