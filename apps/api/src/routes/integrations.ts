import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { requirePermission } from '../plugins/auth';
import { audit } from '../lib/audit';
import { encryptString, decryptString, randomToken, sha256 } from '../lib/crypto';
import { notFound } from '../lib/errors';

const apiClientSchema = z.object({
  name: z.string().min(2).max(120),
  scopes: z.array(z.string()).default(['*']),
});

const webhookSchema = z.object({
  name: z.string().min(2).max(120),
  url: z.string().url(),
  secret: z.string().min(8).optional(),
  events: z.array(z.string()).min(1),
  active: z.boolean().default(true),
});

const connectorSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().nullable(),
  method: z.enum(['GET', 'POST']).default('GET'),
  urlTemplate: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).default(8000),
  active: z.boolean().default(true),
});

export const integrationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  // ---------- API Clients ----------
  app.get('/api-clients', { preHandler: [requirePermission('integrations.manage')] }, async () => {
    const data = await prisma.apiClient.findMany({
      select: { id: true, name: true, keyPrefix: true, scopes: true, active: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return { data };
  });

  app.post('/api-clients', { preHandler: [requirePermission('integrations.manage')] }, async (req, reply) => {
    const input = apiClientSchema.parse(req.body);
    const prefix = randomToken(6).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8).padEnd(8, '0');
    const fullKey = `tc_${prefix}_${randomToken(24)}`;

    const client = await prisma.apiClient.create({
      data: {
        name: input.name,
        keyPrefix: prefix,
        keyHash: sha256(fullKey),
        scopes: input.scopes,
        createdBy: req.actor.userId,
      },
    });
    await audit(req.actor, 'apiClient', client.id, 'create', { after: { name: client.name, keyPrefix: prefix } });
    return reply.status(201).send({ id: client.id, name: client.name, keyPrefix: prefix, apiKey: fullKey });
  });

  app.post('/api-clients/:id/revoke', { preHandler: [requirePermission('integrations.manage')] }, async (req) => {
    const { id } = req.params as { id: string };
    const updated = await prisma.apiClient.update({ where: { id }, data: { active: false } });
    await audit(req.actor, 'apiClient', id, 'revoke');
    return { id: updated.id, active: updated.active };
  });

  // ---------- Webhooks ----------
  app.get('/webhooks', { preHandler: [requirePermission('integrations.manage')] }, async () => {
    const data = await prisma.webhookSubscription.findMany({
      select: { id: true, name: true, url: true, events: true, active: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return { data };
  });

  app.post('/webhooks', { preHandler: [requirePermission('integrations.manage')] }, async (req, reply) => {
    const input = webhookSchema.parse(req.body);
    const secret = input.secret ?? randomToken(24);
    const sub = await prisma.webhookSubscription.create({
      data: {
        name: input.name,
        url: input.url,
        secretEnc: encryptString(secret),
        events: input.events,
        active: input.active,
      },
    });
    await audit(req.actor, 'webhook', sub.id, 'create', { after: { name: sub.name, url: sub.url, events: sub.events } });
    return reply.status(201).send({ id: sub.id, name: sub.name, url: sub.url, events: sub.events, secret });
  });

  app.get('/webhooks/deliveries', { preHandler: [requirePermission('integrations.manage')] }, async () => {
    const data = await prisma.webhookDelivery.findMany({
      include: { subscription: { select: { name: true, url: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { data };
  });

  // ---------- Connectors (for form prefill from external systems) ----------
  app.get('/connectors', async () => {
    const data = await prisma.connector.findMany({
      select: { id: true, key: true, name: true, description: true, method: true, urlTemplate: true, timeoutMs: true, active: true },
      orderBy: { name: 'asc' },
    });
    return { data };
  });

  app.post('/connectors', { preHandler: [requirePermission('integrations.manage')] }, async (req, reply) => {
    const input = connectorSchema.parse(req.body);
    const created = await prisma.connector.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        method: input.method,
        urlTemplate: input.urlTemplate,
        headersEnc: input.headers ? encryptString(JSON.stringify(input.headers)) : null,
        timeoutMs: input.timeoutMs,
        active: input.active,
      },
    });
    await audit(req.actor, 'connector', created.id, 'create', { after: { key: created.key, urlTemplate: created.urlTemplate } });
    return reply.status(201).send(created);
  });

  app.post('/connectors/:key/query', async (req) => {
    const { key } = req.params as { key: string };
    const { query } = (req.body as { query?: string }) ?? {};
    const conn = await prisma.connector.findUnique({ where: { key } });
    if (!conn || !conn.active) throw notFound('Conector no encontrado o inactivo');

    const url = conn.urlTemplate.replace(/\{\{\s*query\s*\}\}/g, encodeURIComponent(query ?? ''));
    const headers: Record<string, string> = conn.headersEnc ? JSON.parse(decryptString(conn.headersEnc)) : {};
    const res = await fetch(url, {
      method: conn.method,
      headers,
      signal: AbortSignal.timeout(conn.timeoutMs),
    });
    const text = await res.text();
    let json: unknown = text;
    try {
      json = JSON.parse(text);
    } catch {
      // plain text fallback
    }
    return { status: res.status, data: json };
  });
};
