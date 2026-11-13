import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requirePermission } from '../plugins/auth';
import { audit } from '../lib/audit';
import { notFound } from '../lib/errors';
import { formTemplateSaveSchema, workflowSaveSchema } from '@terreno/shared';

export const formsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async () => {
    const templates = await prisma.formTemplate.findMany({
      where: { archived: false },
      include: {
        unit: { select: { id: true, code: true, name: true } },
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
      orderBy: { name: 'asc' },
    });
    return { data: templates };
  });

  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const tpl = await prisma.formTemplate.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!tpl) throw notFound('Formulario no encontrado');
    return tpl;
  });

  app.post('/', { preHandler: [requirePermission('forms.manage')] }, async (req, reply) => {
    const input = formTemplateSaveSchema.parse(req.body);
    const created = await prisma.$transaction(async (tx) => {
      const tpl = await tx.formTemplate.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description ?? null,
          unitId: input.unitId ?? null,
          currentVersion: 1,
          draft: input.definition as Prisma.InputJsonValue,
        },
      });
      await tx.formVersion.create({
        data: {
          templateId: tpl.id,
          version: 1,
          definition: input.definition as Prisma.InputJsonValue,
          publishedBy: req.actor.userId,
        },
      });
      await audit(req.actor, 'formTemplate', tpl.id, 'create', { after: { key: tpl.key, name: tpl.name } }, tx);
      return tpl;
    });
    return reply.status(201).send(created);
  });

  app.patch('/:id', { preHandler: [requirePermission('forms.manage')] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = formTemplateSaveSchema.partial().parse(req.body);
    const updated = await prisma.formTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
        ...(input.definition !== undefined ? { draft: input.definition as Prisma.InputJsonValue } : {}),
      },
    });
    await audit(req.actor, 'formTemplate', updated.id, 'update_draft', { after: { name: updated.name } });
    return updated;
  });

  app.post('/:id/publish', { preHandler: [requirePermission('forms.manage')] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as { definition?: unknown } | undefined;

    return prisma.$transaction(async (tx) => {
      const tpl = await tx.formTemplate.findUnique({ where: { id } });
      if (!tpl) throw notFound('Formulario no encontrado');

      const defToPublish = body?.definition
        ? formTemplateSaveSchema.shape.definition.parse(body.definition)
        : formTemplateSaveSchema.shape.definition.parse(tpl.draft);

      const nextVer = tpl.currentVersion + 1;
      const version = await tx.formVersion.create({
        data: {
          templateId: tpl.id,
          version: nextVer,
          definition: defToPublish as Prisma.InputJsonValue,
          publishedBy: req.actor.userId,
        },
      });
      const updated = await tx.formTemplate.update({
        where: { id: tpl.id },
        data: {
          currentVersion: nextVer,
          draft: defToPublish as Prisma.InputJsonValue,
        },
      });
      await audit(req.actor, 'formTemplate', tpl.id, 'publish', { after: { version: nextVer } }, tx);
      return { template: updated, version };
    });
  });
};

export const workflowsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async () => {
    const data = await prisma.workflow.findMany({ orderBy: { name: 'asc' } });
    return { data };
  });

  app.post('/', { preHandler: [requirePermission('workflows.manage')] }, async (req, reply) => {
    const input = workflowSaveSchema.parse(req.body);
    const created = await prisma.workflow.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        definition: input.definition as Prisma.InputJsonValue,
      },
    });
    await audit(req.actor, 'workflow', created.id, 'create', { after: { name: created.name } });
    return reply.status(201).send(created);
  });

  app.patch('/:id', { preHandler: [requirePermission('workflows.manage')] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = workflowSaveSchema.partial().parse(req.body);
    const updated = await prisma.workflow.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.definition !== undefined ? { definition: input.definition as Prisma.InputJsonValue } : {}),
      },
    });
    await audit(req.actor, 'workflow', updated.id, 'update', { after: { name: updated.name } });
    return updated;
  });
};
