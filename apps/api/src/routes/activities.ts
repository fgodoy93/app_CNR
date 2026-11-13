import type { FastifyPluginAsync } from 'fastify';
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
import { availableTransitions } from '@terreno/shared';
import { activityCreateSchema, activityUpdateSchema, transitionSchema } from '@terreno/shared';

export const activitiesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (req) => {
    const list = await prisma.activity.findMany({
      where: activityScope(req.actor),
      include: activityInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
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

    return {
      activity: serializeActivity(act),
      availableTransitions: transitions,
      formDefinition: formDef,
      workflow: wf,
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
};
