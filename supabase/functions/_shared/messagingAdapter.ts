// Evolution API adapter + Resend email for RH messaging bridge

import { formatWhatsAppNumber, normalizePhoneE164BR } from './phoneUtils.ts';

export type SendTextResult = { ok: boolean; error?: string };
export type SendMediaResult = { ok: boolean; error?: string };

export async function evolutionHealthCheck(
  baseUrl: string,
  apiKey: string,
  instance: string,
): Promise<{ connected: boolean; state?: string; error?: string }> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/instance/connectionState/${encodeURIComponent(instance)}`;
    const res = await fetch(url, {
      headers: { apikey: apiKey },
    });
    if (!res.ok) {
      return { connected: false, error: `HTTP ${res.status}: ${await res.text()}` };
    }
    const data = await res.json();
    const state = data?.instance?.state ?? data?.state ?? '';
    return { connected: state === 'open', state: String(state) };
  } catch (e) {
    return { connected: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function evolutionSendText(
  baseUrl: string,
  apiKey: string,
  instance: string,
  phoneE164: string,
  text: string,
): Promise<SendTextResult> {
  const number = formatWhatsAppNumber(phoneE164);
  const url = `${baseUrl.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(instance)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, text }),
    });
    if (!res.ok) {
      return { ok: false, error: `Evolution ${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function evolutionSendDocument(
  baseUrl: string,
  apiKey: string,
  instance: string,
  phoneE164: string,
  base64: string,
  fileName: string,
  caption: string,
): Promise<SendMediaResult> {
  const number = formatWhatsAppNumber(phoneE164);
  const url = `${baseUrl.replace(/\/$/, '')}/message/sendMedia/${encodeURIComponent(instance)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number,
        mediatype: 'document',
        mimetype: 'application/pdf',
        caption,
        fileName,
        media: base64,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Evolution ${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resendSendEmail(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
  attachment?: { filename: string; content: string },
): Promise<SendTextResult> {
  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    html,
  };
  if (attachment) {
    payload.attachments = [{ filename: attachment.filename, content: attachment.content }];
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function resolveRecipientPhone(
  explicit: string | undefined,
  profileMobile: string | null | undefined,
  profileWhatsapp: string | null | undefined,
): string | null {
  return normalizePhoneE164BR(explicit || profileWhatsapp || profileMobile);
}

export function announcementEmailHtml(title: string, content: string, orgName: string): string {
  const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
    <h2 style="color:#c41e24;margin:0 0 12px;">${safeTitle}</h2>
    <p style="color:#64748b;font-size:13px;margin:0 0 20px;">${orgName} — Comunicado RH</p>
    <div style="color:#0f172a;font-size:15px;line-height:1.6;">${safeContent}</div>
    <p style="color:#94a3b8;font-size:12px;margin-top:32px;">Eletropasso RH — suporte@eletropasso.com.br</p>
  </div>`;
}
