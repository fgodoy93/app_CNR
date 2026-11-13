import type { FastifyPluginAsync } from 'fastify';
import { processSyncPush } from '../services/sync';
import { syncPushSchema } from '@terreno/shared';

export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.post('/push', async (req, reply) => {
    const { deviceId, mutations } = syncPushSchema.parse(req.body);
    const results = await processSyncPush(req.actor, deviceId, mutations);
    return reply.send({ results });
  });
};
