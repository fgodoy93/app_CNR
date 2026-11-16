import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createEvidence, deleteEvidence, updateEvidence } from '../services/evidences';
import { transcribeAudioBuffer } from '../services/stt';
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
  'audio/aac',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/3gpp',
]);

function resolveSafeMime(rawMime: string | null, fileName: string | null): { mime: string; isSafeInline: boolean } {
  let base = (rawMime || '').split(';')[0]!.trim().toLowerCase();
  if ((!base || base === 'application/octet-stream') && fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) base = 'audio/mp4';
    else if (lower.endsWith('.webm')) base = 'audio/webm';
    else if (lower.endsWith('.ogg')) base = 'audio/ogg';
    else if (lower.endsWith('.mp3')) base = 'audio/mpeg';
    else if (lower.endsWith('.wav')) base = 'audio/wav';
    else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) base = 'image/jpeg';
    else if (lower.endsWith('.png')) base = 'image/png';
    else if (lower.endsWith('.pdf')) base = 'application/pdf';
  }
  if (base === 'audio/m4a' || base === 'audio/x-m4a') base = 'audio/mp4';
  if (base === 'audio/x-wav') base = 'audio/wav';
  const isSafeInline = SAFE_INLINE_MIMES.has(base);
  return { mime: isSafeInline ? base : 'application/octet-stream', isSafeInline };
}

export const evidencesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/:id/file', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ev = await prisma.evidence.findUnique({ where: { id } });
    if (!ev || ev.deletedAt || !ev.storageKey) throw notFound('Evidencia no encontrada');
    await getActivityForActor(req.actor, ev.activityId);
    const buf = await storage.get(ev.storageKey, ev.encrypted);
    const safeName = (ev.fileName || ev.id).replace(/["\r\n\\]/g, '_');
    const { mime, isSafeInline } = resolveSafeMime(ev.mimeType, ev.fileName);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Type', mime);
    reply.header('Content-Disposition', `${isSafeInline ? 'inline' : 'attachment'}; filename="${safeName}"`);
    return buf;
  });

  app.post('/transcribe', async (req) => {
    const file = await req.file();
    if (!file) throw badRequest('Se requiere un archivo de audio en el campo "file"');
    const buf = await file.toBuffer();
    const text = await transcribeAudioBuffer(buf, file.filename || 'audio.m4a', file.mimetype || 'audio/mp4');
    return { text };
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

  app.patch('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const patch = z
      .object({
        note: z.string().max(20000).nullable().optional(),
        transcript: z.string().max(20000).nullable().optional(),
        fileName: z.string().max(255).nullable().optional(),
      })
      .parse(req.body);
    return updateEvidence(req.actor, id, patch);
  });

  app.delete('/:id', async (req) => {
    const { id } = req.params as { id: string };
    return deleteEvidence(req.actor, id);
  });
};
