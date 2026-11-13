import type { FastifyPluginAsync } from 'fastify';
import { processSyncPush } from '../services/sync';
import { syncPushSchema } from '@terreno/shared';
import { prisma } from '../db';
import { activityScope, activityInclude, serializeActivity } from '../services/activities';

export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/pull', async (req) => {
    const { since } = req.query as { since?: string };
    const sinceDate = since ? new Date(since) : undefined;

    const [activities, activityTypes, formVersions, workflows] = await Promise.all([
      prisma.activity.findMany({
        where: {
          AND: [activityScope(req.actor), ...(sinceDate ? [{ updatedAt: { gte: sinceDate } }] : [])],
        },
        include: activityInclude,
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      prisma.activityType.findMany({ where: { active: true } }),
      prisma.formVersion.findMany({ orderBy: { version: 'desc' } }),
      prisma.workflow.findMany(),
    ]);

    return {
      serverTime: new Date().toISOString(),
      activities: activities.map(serializeActivity),
      activityTypes,
      formVersions,
      workflows,
    };
  });

  app.post('/push', async (req, reply) => {
    const { deviceId, mutations } = syncPushSchema.parse(req.body);
    const results = await processSyncPush(req.actor, deviceId, mutations);
    return reply.send({ results });
  });
};
