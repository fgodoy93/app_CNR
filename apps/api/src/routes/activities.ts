import type { FastifyPluginAsync } from 'fastify';
import QRCode from 'qrcode';
import { prisma } from '../db';
import {
  createActivity,
  updateActivity,
  executeTransition,
  getActivityForActor,
  activityScope,
  activityInclude,
  serializeActivity,
} from '../services/activities';
import { loadWorkflow, loadFormDefinition } from '../services/activities';
import { generateDocument } from '../services/documents';
import { notifyUsers } from '../lib/notifications';
import { availableTransitions } from '@terreno/shared';
import { activityCreateSchema, activityUpdateSchema, transitionSchema } from '@terreno/shared';

export const activitiesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (req) => {
    const { status, priority, typeId, parentId, q } = req.query as {
      status?: string;
      priority?: string;
      typeId?: string;
      parentId?: string;
      q?: string;
    };
    const list = await prisma.activity.findMany({
      where: {
        AND: [
          activityScope(req.actor),
          ...(status ? [{ status }] : []),
          ...(priority ? [{ priority: priority as never }] : []),
          ...(typeId ? [{ typeId }] : []),
          ...(parentId === 'root' ? [{ parentId: null }] : parentId ? [{ parentId }] : []),
          ...(q
            ? [
                {
                  OR: [
                    { folio: { contains: q, mode: 'insensitive' as const } },
                    { title: { contains: q, mode: 'insensitive' as const } },
                    { address: { contains: q, mode: 'insensitive' as const } },
                  ],
                },
              ]
            : []),
        ],
      },
      include: activityInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { data: list.map(serializeActivity) };
  });

  app.post('/', async (req, reply) => {
    const input = activityCreateSchema.parse(req.body);
    const result = await createActivity(req.actor, input);
    return reply.status(result.created ? 201 : 200).send(serializeActivity(result.activity));
  });

  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const act = await getActivityForActor(req.actor, id);
    const wf = await loadWorkflow(act.typeId);
    const transitions = availableTransitions(wf, { status: act.status, assigneeId: act.assigneeId }, req.actor);
    const formDef = await loadFormDefinition(act.formVersionId);

    const [geoFeatures, evidences, transitionHistory, documents, comments, visits] = await Promise.all([
      prisma.geoFeature.findMany({ where: { activityId: act.id, deletedAt: null }, orderBy: { capturedAt: 'asc' } }),
      prisma.evidence.findMany({
        where: { activityId: act.id, deletedAt: null },
        include: { uploadedBy: { select: { id: true, name: true } } },
        orderBy: { capturedAt: 'asc' },
      }),
      prisma.activityTransition.findMany({
        where: { activityId: act.id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.document.findMany({
        where: { activityId: act.id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.activityComment.findMany({
        where: { activityId: act.id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.activity.findMany({
        where: { AND: [activityScope(req.actor), { parentId: act.id }] },
        include: activityInclude,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const allEvRows = await prisma.evidence.findMany({
      where: { activityId: act.id },
      select: { id: true },
    });
    const evIds = allEvRows.map((e) => e.id);
    const geoIds = geoFeatures.map((g) => g.id);

    const [evidenceAuditLogs, auditLogs] = await Promise.all([
      evIds.length
        ? prisma.auditLog.findMany({
            where: { entity: 'evidence', entityId: { in: evIds } },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
        : Promise.resolve([]),
      prisma.auditLog.findMany({
        where: {
          OR: [
            { entity: 'activity', entityId: act.id },
            ...(evIds.length ? [{ entity: 'evidence', entityId: { in: evIds } }] : []),
            ...(geoIds.length ? [{ entity: 'geoFeature', entityId: { in: geoIds } }] : []),
            { changes: { path: ['meta', 'activityId'], equals: act.id } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return {
      activity: serializeActivity(act),
      visits: visits.map(serializeActivity),
      availableTransitions: transitions,
      formDefinition: formDef,
      workflow: wf,
      geoFeatures,
      evidences,
      transitionHistory,
      documents,
      comments,
      evidenceAuditLogs,
      auditLogs,
    };
  });

  app.patch('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const patch = activityUpdateSchema.parse(req.body);
    const updated = await updateActivity(req.actor, id, patch);
    return serializeActivity(updated);
  });

  app.post('/:id/transitions', async (req) => {
    const { id } = req.params as { id: string };
    const { transition, comment } = transitionSchema.parse(req.body);
    const updated = await executeTransition(req.actor, id, transition, comment);
    return serializeActivity(updated);
  });

  app.post('/:id/documents', async (req, reply) => {
    const { id } = req.params as { id: string };
    const act = await getActivityForActor(req.actor, id);
    const { kind } = (req.body as { kind?: 'REPORT' | 'VOUCHER' }) ?? {};
    const doc = await generateDocument(act.id, kind === 'VOUCHER' ? 'VOUCHER' : 'REPORT', req.actor.userId ?? undefined);
    return reply.status(201).send(doc);
  });

  app.get('/:id/qr', async (req) => {
    const { id } = req.params as { id: string };
    const act = await getActivityForActor(req.actor, id);
    const payload = `TERRENOCNR:OT:${act.id}:${act.folio}`;
    const qrDataUrl = await QRCode.toDataURL(payload, { width: 280, margin: 2 });
    return { id: act.id, folio: act.folio, payload, qrDataUrl };
  });

  app.post('/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const act = await getActivityForActor(req.actor, id);
    const { body } = (req.body as { body?: string }) ?? {};
    if (!body?.trim()) return reply.status(400).send({ message: 'Comentario vacío' });
    const comment = await prisma.activityComment.create({
      data: { activityId: act.id, userId: req.actor.userId, body: body.trim() },
      include: { user: { select: { id: true, name: true } } },
    });
    await notifyUsers({
      userIds: [act.createdById, act.assigneeId],
      excludeUserId: req.actor.userId,
      title: `Nuevo comentario en ${act.folio}`,
      body: `${req.actor.name || 'Usuario'}: ${body.trim().slice(0, 120)}`,
      link: `/actividades/${act.id}`,
    });
    return reply.status(201).send(comment);
  });
};
