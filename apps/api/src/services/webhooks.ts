import { prisma, type Tx } from '../db';
import { decryptString, hmacSha256 } from '../lib/crypto';
import { webhookDeliveries } from '../lib/metrics';
import { assertSafeOutboundUrl } from '../lib/urlSafety';

export async function emitEvent(event: string, payload: unknown, tx: Tx = prisma) {
  // Find active subscriptions that match this event or all events ('*')
  const subs = await tx.webhookSubscription.findMany({
    where: {
      active: true,
      OR: [{ events: { has: event } }, { events: { has: '*' } }],
    },
  });

  for (const sub of subs) {
    await tx.webhookDelivery.create({
      data: {
        subscriptionId: sub.id,
        event,
        payload: payload as object,
        status: 'PENDING',
      },
    });
  }
}

const BACKOFF_MIN = [1, 5, 15, 60, 180];

export async function processWebhookDeliveries(log: {
  info: (o: object, m?: string) => void;
  warn: (o: object, m?: string) => void;
}) {
  const pending = await prisma.webhookDelivery.findMany({
    where: {
      status: 'PENDING',
      nextAttemptAt: { lte: new Date() },
    },
    include: { subscription: true },
    take: 25,
    orderBy: { createdAt: 'asc' },
  });

  for (const delivery of pending) {
    const sub = delivery.subscription;
    if (!sub.active) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'CANCELLED' },
      });
      continue;
    }

    const body = JSON.stringify({
      id: delivery.id,
      event: delivery.event,
      createdAt: delivery.createdAt,
      data: delivery.payload,
    });

    const secret = decryptString(sub.secretEnc);
    const signature = hmacSha256(secret, body);

    try {
      assertSafeOutboundUrl(sub.url);
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Terreno-Event': delivery.event,
          'X-Terreno-Delivery': delivery.id,
          'X-Terreno-Signature': signature,
          'User-Agent': 'TerrenoCNR-Webhook/1.0',
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'DELIVERED',
            responseCode: res.status,
            deliveredAt: new Date(),
            attempts: delivery.attempts + 1,
          },
        });
        webhookDeliveries.inc({ status: 'success' });
        log.info({ deliveryId: delivery.id, url: sub.url }, 'Webhook entregado con éxito');
      } else {
        throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      }
    } catch (err: unknown) {
      const attempts = delivery.attempts + 1;
      const isDead = attempts >= BACKOFF_MIN.length;
      const delayMin = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)]!;

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts,
          status: isDead ? 'FAILED' : 'PENDING',
          responseCode: null,
          lastError: String((err as Error).message).slice(0, 1000),
          nextAttemptAt: new Date(Date.now() + delayMin * 60_000),
        },
      });

      webhookDeliveries.inc({ status: 'failure' });
      log.warn({ deliveryId: delivery.id, attempts, error: (err as Error).message }, 'Fallo en envío de webhook');
    }
  }
}
