import nodemailer, { type Transporter } from 'nodemailer';
import { alertEmails, config } from '../config';
import { prisma } from '../db';
import { storage } from './storage';

let transporter: Transporter | null = null;
function getTransport(): Transporter | null {
  if (!config.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return transporter;
}

export interface MailAttachmentRef {
  filename: string;
  storageKey: string;
  encrypted: boolean;
  contentType?: string;
}

function layout(subject: string, body: string) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f1f5f9;padding:24px">
<div style="max-width:600px;margin:auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
<div style="background:#0f4c81;color:#fff;padding:16px 24px;font-size:18px;font-weight:bold">TerrenoCNR</div>
<div style="padding:24px;color:#0f172a"><h2 style="margin-top:0">${subject}</h2>${body}</div>
<div style="padding:12px 24px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0">Mensaje automático de la plataforma de gestión en terreno. No responder.</div>
</div></body></html>`;
}

/** Queues an email in the transactional outbox. Delivery is retried by the mail worker. */
export async function queueEmail(to: string[], subject: string, bodyHtml: string, attachments: MailAttachmentRef[] = []) {
  const recipients = [...new Set(to.filter((e) => /.+@.+\..+/.test(e)))];
  if (recipients.length === 0) return null;
  return prisma.emailOutbox.create({
    data: { to: recipients, subject, html: layout(subject, bodyHtml), attachments: attachments as never },
  });
}

export async function sendAlert(subject: string, body: string) {
  if (alertEmails.length === 0) return;
  await queueEmail(alertEmails, `[ALERTA] ${subject}`, `<p>${body}</p>`);
}

const BACKOFF_MIN = [1, 5, 15, 60, 180];

export async function processEmailOutbox(log: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void }) {
  const batch = await prisma.emailOutbox.findMany({
    where: { status: 'PENDING', nextAttempt: { lte: new Date() } },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });
  const t = getTransport();
  for (const m of batch) {
    try {
      if (!t) {
        // No SMTP configured: emails stay visible in the outbox (admin > correos) and are marked as simulated.
        await prisma.emailOutbox.update({ where: { id: m.id }, data: { status: 'SIMULATED', sentAt: new Date(), attempts: m.attempts + 1 } });
        log.info({ to: m.to, subject: m.subject }, 'email simulado (sin SMTP)');
        continue;
      }
      const refs = (m.attachments as unknown as MailAttachmentRef[]) ?? [];
      const attachments = await Promise.all(
        refs.map(async (a) => ({ filename: a.filename, content: await storage.get(a.storageKey, a.encrypted), contentType: a.contentType })),
      );
      await t.sendMail({ from: config.MAIL_FROM, to: m.to.join(','), subject: m.subject, html: m.html, attachments });
      await prisma.emailOutbox.update({ where: { id: m.id }, data: { status: 'SENT', sentAt: new Date(), attempts: m.attempts + 1 } });
    } catch (err) {
      const attempts = m.attempts + 1;
      const dead = attempts >= BACKOFF_MIN.length;
      const delay = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)]!;
      await prisma.emailOutbox.update({
        where: { id: m.id },
        data: {
          attempts,
          status: dead ? 'FAILED' : 'PENDING',
          lastError: String((err as Error).message).slice(0, 1000),
          nextAttempt: new Date(Date.now() + delay * 60_000),
        },
      });
      log.warn({ err, id: m.id }, 'error enviando email');
    }
  }
}
