import type { FastifyPluginAsync } from 'fastify';
import { generateActivitiesExcel } from '../services/reports';
import { prisma } from '../db';
import { activityScope } from '../services/activities';

export const reportsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/dashboard', async (req) => {
    const scope = activityScope(req.actor);

    const [total, byStatus, byPriority, byType] = await Promise.all([
      prisma.activity.count({ where: scope }),
      prisma.activity.groupBy({
        by: ['status'],
        where: scope,
        _count: true,
      }),
      prisma.activity.groupBy({
        by: ['priority'],
        where: scope,
        _count: true,
      }),
      prisma.activity.groupBy({
        by: ['typeId'],
        where: scope,
        _count: true,
      }),
    ]);

    const types = await prisma.activityType.findMany({ select: { id: true, name: true, color: true } });
    const typeMap = new Map(types.map((t) => [t.id, t]));

    return {
      total,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      byPriority: byPriority.map((p) => ({ priority: p.priority, count: p._count })),
      byType: byType.map((t) => ({
        typeId: t.typeId,
        typeName: typeMap.get(t.typeId)?.name || 'Desconocido',
        color: typeMap.get(t.typeId)?.color || '#64748b',
        count: t._count,
      })),
    };
  });

  app.get('/excel', async (req, reply) => {
    const query = req.query as {
      status?: string;
      priority?: string;
      assigneeId?: string;
      unitId?: string;
      q?: string;
    };
    const buffer = await generateActivitiesExcel(req.actor, query);
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename="reporte-actividades-cnr.xlsx"');
    return buffer;
  });
};
