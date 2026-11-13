import type { FastifyPluginAsync } from 'fastify';
import { createEvidence } from '../services/evidences';
import { evidenceMetaSchema } from '@terreno/shared';
import { badRequest, notFound } from '../lib/errors';
import { prisma } from '../db';
import { storage } from '../lib/storage';
import { getActivityForActor } from '../services/activities';

const SAFE_INLINE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
]);

export const evidencesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/:id/file', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ev = await prisma.evidence.findUnique({ where: { id } });
    if (!ev || ev.deletedAt || !ev.storageKey) throw notFound('Evidencia no encontrada');
    await getActivityForActor(req.actor, ev.activityId);
    const buf = await storage.get(ev.storageKey, ev.encrypted);
    const safeName = (ev.fileName || ev.id).replace(/["\r\n\\]/g, '_');
    const mime = (ev.mimeType || 'application/octet-stream').toLowerCase();
    const isSafeInline = SAFE_INLINE_MIMES.has(mime);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Type', isSafeInline ? mime : 'application/octet-stream');
    reply.header('Content-Disposition', `${isSafeInline ? 'inline' : 'attachment'}; filename="${safeName}"`);
    return buf;
  });

  app.post('/', async (req, reply) => {
    // Process multipart/form-data
    const parts = req.parts();
    let meta: any = null;
    let fileBuffer: Buffer | undefined;
    let fileName: string | undefined;
    let mimeType: string | undefined;

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'meta') {
        try {
          meta = evidenceMetaSchema.parse(JSON.parse(part.value as string));
        } catch (e: any) {
          throw badRequest(`Metadatos inválidos: ${e.message}`);
        }
      } else if (part.type === 'file' && part.fieldname === 'file') {
        fileName = part.filename;
        mimeType = part.mimetype;
        fileBuffer = await part.toBuffer();
      }
    }

    if (!meta) throw badRequest('Se requiere el campo "meta" con los datos de la evidencia');

    const result = await createEvidence(
      req.actor,
      {
        ...meta,
        fileName: fileName || meta.fileName,
        mimeType: mimeType || meta.mimeType,
      },
      fileBuffer,
    );

    return reply.status(201).send(result);
  });
};
