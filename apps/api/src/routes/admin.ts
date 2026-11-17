import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hash } from '@node-rs/argon2';
import { prisma } from '../db';
import { can, requirePermission } from '../plugins/auth';
import { audit } from '../lib/audit';
import { badRequest, notFound } from '../lib/errors';
import { activityTypeSaveSchema } from '@terreno/shared';

const unitSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(200),
  active: z.boolean().default(true),
});

const roleSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().nullable(),
  permissions: z.array(z.string()).min(1),
});

const userCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(200),
  rut: z.string().max(20).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  position: z.string().max(120).optional().nullable(),
  password: z.string().min(8),
  roleId: z.string().min(1),
  unitId: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

const userUpdateSchema = userCreateSchema.partial().omit({ password: true }).extend({
  password: z.string().min(8).optional(),
});

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  // ---------- Units ----------
  app.get('/units', async () => {
    const data = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
    return { data };
  });

  app.post('/units', { preHandler: [requirePermission('users.manage')] }, async (req, reply) => {
    const input = unitSchema.parse(req.body);
    const unit = await prisma.unit.create({ data: input });
    await audit(req.actor, 'unit', unit.id, 'create', { after: unit });
    return reply.status(201).send(unit);
  });

  app.patch('/units/:id', { preHandler: [requirePermission('users.manage')] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = unitSchema.partial().parse(req.body);
    const unit = await prisma.unit.update({ where: { id }, data: input });
    await audit(req.actor, 'unit', unit.id, 'update', { after: input });
    return unit;
  });

  // ---------- Roles ----------
  app.get('/roles', async () => {
    const data = await prisma.role.findMany({ orderBy: { name: 'asc' } });
    return { data };
  });

  app.post('/roles', { preHandler: [requirePermission('users.manage')] }, async (req, reply) => {
    const input = roleSchema.parse(req.body);
    const role = await prisma.role.create({ data: input });
    await audit(req.actor, 'role', role.id, 'create', { after: role });
    return reply.status(201).send(role);
  });

  app.patch('/roles/:id', { preHandler: [requirePermission('users.manage')] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = roleSchema.partial().parse(req.body);
    const role = await prisma.role.update({ where: { id }, data: input });
    await audit(req.actor, 'role', role.id, 'update', { after: input });
    return role;
  });

  // ---------- Users ----------
  app.get('/users', async (req) => {
    const canManage = can(req.actor, 'users.manage');
    const users = await prisma.user.findMany({
      include: { role: true, unit: true },
      orderBy: { name: 'asc' },
    });
    return {
      data: users.map((u) => ({
        id: u.id,
        name: u.name,
        active: u.active,
        role: { id: u.role.id, key: u.role.key, name: u.role.name },
        unit: u.unit ? { id: u.unit.id, code: u.unit.code, name: u.unit.name } : null,
        ...(canManage
          ? {
              email: u.email,
              rut: u.rut,
              phone: u.phone,
              position: u.position,
              lastLoginAt: u.lastLoginAt,
            }
          : {}),
      })),
    };
  });

  app.post('/users', { preHandler: [requirePermission('users.manage')] }, async (req, reply) => {
    const input = userCreateSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw badRequest('Ya existe un usuario con ese correo');

    const passwordHash = await hash(input.password);
    const user = await prisma.user.create({
      data: {
        email,
        name: input.name,
        rut: input.rut ?? null,
        phone: input.phone ?? null,
        position: input.position ?? null,
        passwordHash,
        roleId: input.roleId,
        unitId: input.unitId ?? null,
        active: input.active,
      },
      include: { role: true, unit: true },
    });
    await audit(req.actor, 'user', user.id, 'create', { after: { email: user.email, name: user.name, role: user.role.key } });
    return reply.status(201).send({ id: user.id, email: user.email, name: user.name });
  });

  app.patch('/users/:id', { preHandler: [requirePermission('users.manage')] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = userUpdateSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (input.email !== undefined) data.email = input.email.toLowerCase();
    if (input.name !== undefined) data.name = input.name;
    if (input.rut !== undefined) data.rut = input.rut;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.position !== undefined) data.position = input.position;
    if (input.roleId !== undefined) data.roleId = input.roleId;
    if (input.unitId !== undefined) data.unitId = input.unitId;
    if (input.active !== undefined) data.active = input.active;
    if (input.password) data.passwordHash = await hash(input.password);

    const user = await prisma.user.update({ where: { id }, data });
    await audit(req.actor, 'user', user.id, 'update', { after: { name: user.name, active: user.active } });
    return { id: user.id, email: user.email, name: user.name, active: user.active };
  });

  // ---------- Activity Types ----------
  app.get('/activity-types', async () => {
    const data = await prisma.activityType.findMany({
      include: {
        formTemplate: { select: { id: true, key: true, name: true, currentVersion: true } },
        workflow: { select: { id: true, name: true } },
        unit: { select: { id: true, code: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return { data };
  });

  app.post('/activity-types', { preHandler: [requirePermission('types.manage')] }, async (req, reply) => {
    const input = activityTypeSaveSchema.parse(req.body);
    const created = await prisma.activityType.create({ data: input });
    await audit(req.actor, 'activityType', created.id, 'create', { after: created });
    return reply.status(201).send(created);
  });

  app.patch('/activity-types/:id', { preHandler: [requirePermission('types.manage')] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = activityTypeSaveSchema.partial().parse(req.body);
    const updated = await prisma.activityType.update({ where: { id }, data: input });
    await audit(req.actor, 'activityType', updated.id, 'update', { after: input });
    return updated;
  });

  // ---------- Audit, Notifications, Email Outbox ----------
  app.get('/audit', { preHandler: [requirePermission('audit.view')] }, async (req) => {
    const { entity, entityId, limit } = req.query as { entity?: string; entityId?: string; limit?: string };
    const data = await prisma.auditLog.findMany({
      where: {
        ...(entity ? { entity } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 100, 500),
    });
    return { data };
  });

  app.get('/notifications', async (req) => {
    if (!req.actor.userId) return { data: [], unread: 0 };
    const [data, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.actor.userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({
        where: { userId: req.actor.userId, readAt: null },
      }),
    ]);
    return { data, unread };
  });

  app.post('/notifications/read-all', async (req) => {
    if (!req.actor.userId) return { ok: true, count: 0 };
    const res = await prisma.notification.updateMany({
      where: { userId: req.actor.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, count: res.count };
  });

  app.post('/notifications/:id/read', async (req) => {
    const { id } = req.params as { id: string };
    const n = await prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== req.actor.userId) throw notFound('Notificación no encontrada');
    return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  });

  app.get('/emails', { preHandler: [requirePermission('audit.view')] }, async () => {
    const data = await prisma.emailOutbox.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return { data };
  });
};
