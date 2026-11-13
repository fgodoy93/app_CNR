import type { FastifyPluginAsync } from 'fastify';
import { createEvidence } from '../services/evidences';
import { evidenceMetaSchema } from '@terreno/shared';
import { badRequest } from '../lib/errors';

export const evidencesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

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
