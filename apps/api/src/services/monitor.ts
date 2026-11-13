import { alertEmails } from '../config';
import { prisma } from '../db';
import { storage } from '../lib/storage';

let lastDegradedAlertAt = 0;
let wasDegraded = false;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

export async function getSystemHealth() {
  const started = Date.now();
  const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  const dbLatencyMs = Date.now() - started;
  const storageOk = await storage.ping().catch(() => false);
  const failedWebhooks = dbOk
    ? await prisma.webhookDelivery.count({ where: { status: 'FAILED' } }).catch(() => 0)
    : 0;
  const mem = process.memoryUsage();

  return {
    status: dbOk && storageOk ? 'ok' : 'degraded',
    db: dbOk,
    dbLatencyMs,
    storage: storageOk,
    failedWebhooks,
    uptimeSec: Math.round(process.uptime()),
    memoryMb: Math.round(mem.rss / 1024 / 1024),
    timestamp: new Date().toISOString(),
  };
}

/** Checks system health periodically and queues alert emails to ALERT_EMAILS on degradation/recovery. */
export async function runHealthMonitor(log: { warn: (o: object, m?: string) => void; info: (o: object, m?: string) => void }) {
  const health = await getSystemHealth();
  if (health.status !== 'ok') {
    log.warn({ health }, 'Alerta de monitoreo: plataforma en estado degradado');
    const now = Date.now();
    if (alertEmails.length > 0 && health.db && now - lastDegradedAlertAt >= ALERT_COOLDOWN_MS) {
      lastDegradedAlertAt = now;
      wasDegraded = true;
      await prisma.emailOutbox
        .create({
          data: {
            to: alertEmails,
            subject: '[ALERTA TerrenoCNR] Servicio en estado degradado',
            html: `<p>Se detectó una anomalía en TerrenoCNR.</p><ul><li>DB: ${health.db}</li><li>Storage: ${health.storage}</li><li>Webhooks fallidos: ${health.failedWebhooks}</li><li>Fecha: ${health.timestamp}</li></ul>`,
          },
        })
        .catch(() => undefined);
    }
  } else if (wasDegraded) {
    wasDegraded = false;
    log.info({ health }, 'Monitoreo: plataforma recuperada');
    if (alertEmails.length > 0) {
      await prisma.emailOutbox
        .create({
          data: {
            to: alertEmails,
            subject: '[RECUPERADO TerrenoCNR] Servicio operativo',
            html: `<p>Los servicios de TerrenoCNR volvieron a estado operativo.</p><p>Fecha: ${health.timestamp}</p>`,
          },
        })
        .catch(() => undefined);
    }
  }
}
