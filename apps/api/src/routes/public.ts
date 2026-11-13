import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { notFound } from '../lib/errors';
import { storage } from '../lib/storage';

export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get('/verify/:code', async (req, reply) => {
    const { code } = req.params as { code: string };

    const doc = await prisma.document.findUnique({
      where: { verifyCode: code },
      include: {
        activity: {
          include: {
            type: true,
            unit: true,
            assignee: true,
          },
        },
      },
    });

    if (!doc) throw notFound('Documento no encontrado o código de verificación inválido');

    return {
      valid: true,
      code: doc.verifyCode,
      kind: doc.kind,
      generatedAt: doc.createdAt,
      sha256: doc.sha256,
      activity: {
        folio: doc.activity.folio,
        title: doc.activity.title,
        status: doc.activity.status,
        type: doc.activity.type.name,
        unit: doc.activity.unit?.name || 'General',
        responsible: doc.activity.assignee?.name || 'Sin asignar',
      },
      downloadUrl: `/api/v1/documents/${doc.id}/download`,
    };
  });

  app.get('/documents/:id/download', async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw notFound('Documento no encontrado');

    const file = await storage.get(doc.storageKey, false);
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="${doc.kind.toLowerCase()}-${doc.verifyCode}.pdf"`);
    return file;
  });
};
