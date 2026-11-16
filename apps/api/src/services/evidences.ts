import { prisma } from '../db';
import { storage } from '../lib/storage';
import { sha256 } from '../lib/crypto';
import { audit } from '../lib/audit';
import { getActivityForActor } from './activities';
import { transcribeAudioBuffer } from './stt';
import { badRequest, notFound } from '../lib/errors';
import type { Actor } from '../types';
import type { EvidenceKind } from '@prisma/client';

async function transcribeAudioAsync(
  evidenceId: string,
  activityId: string,
  fieldKey: string | null | undefined,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
) {
  try {
    const text = await transcribeAudioBuffer(fileBuffer, fileName, mimeType);
    if (!text) return;
    await prisma.evidence.update({ where: { id: evidenceId }, data: { transcript: text } });
    if (fieldKey) {
      const act = await prisma.activity.findUnique({ where: { id: activityId }, select: { data: true } });
      const data = (act?.data as Record<string, unknown>) || {};
      if (typeof data[fieldKey] !== 'string' || !String(data[fieldKey]).trim()) {
        await prisma.activity.update({
          where: { id: activityId },
          data: { data: { ...data, [fieldKey]: text } as any },
        });
      }
    }
  } catch {
    // Best-effort background transcription
  }
}

export async function createEvidence(
  actor: Actor,
  input: {
    id: string;
    activityId: string;
    geoFeatureId?: string | null;
    kind: EvidenceKind;
    fieldKey?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    note?: string | null;
    transcript?: string | null;
    source?: string | null;
    lat?: number | null;
    lng?: number | null;
    accuracy?: number | null;
    capturedAt: string | Date;
    expectedSha256?: string | null;
  },
  fileBuffer?: Buffer,
) {
  await getActivityForActor(actor, input.activityId);

  // If already uploaded (idempotency), return existing
  const existing = await prisma.evidence.findUnique({ where: { id: input.id } });
  if (existing) return existing;

  let storageKey: string | null = null;
  let fileHash: string | null = null;
  let isEncrypted = false;
  let size: number | null = null;

  if (fileBuffer && fileBuffer.length > 0) {
    fileHash = sha256(fileBuffer);
    if (input.expectedSha256 && input.expectedSha256 !== fileHash) {
      throw badRequest('El hash SHA-256 del archivo no coincide con el calculado por el dispositivo');
    }

    size = fileBuffer.length;
    storageKey = `evidences/${input.activityId}/${input.id}-${input.fileName || 'file'}`;
    const result = await storage.put(storageKey, fileBuffer, {
      contentType: input.mimeType || 'application/octet-stream',
    });
    isEncrypted = result.encrypted;
  }

  const created = await prisma.evidence.create({
    data: {
      id: input.id,
      activityId: input.activityId,
      geoFeatureId: input.geoFeatureId || null,
      kind: input.kind,
      fieldKey: input.fieldKey || null,
      fileName: input.fileName || null,
      mimeType: input.mimeType || null,
      size,
      sha256: fileHash,
      storageKey,
      encrypted: isEncrypted,
      note: input.note || null,
      transcript: input.transcript || null,
      source: input.source || 'camera',
      lat: input.lat || null,
      lng: input.lng || null,
      accuracy: input.accuracy || null,
      capturedAt: new Date(input.capturedAt),
      uploadedById: actor.userId,
    },
  });

  if (input.kind === 'AUDIO' && !input.transcript && fileBuffer && fileBuffer.length > 0) {
    void transcribeAudioAsync(
      created.id,
      input.activityId,
      input.fieldKey,
      fileBuffer,
      input.fileName || `${created.id}.m4a`,
      input.mimeType || 'audio/mp4',
    );
  }

  return created;
}

export async function updateEvidence(
  actor: Actor,
  id: string,
  patch: { note?: string | null; transcript?: string | null; fileName?: string | null },
) {
  const existing = await prisma.evidence.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw notFound('Evidencia no encontrada');
  await getActivityForActor(actor, existing.activityId);

  const updated = await prisma.evidence.update({
    where: { id },
    data: {
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.transcript !== undefined ? { transcript: patch.transcript } : {}),
      ...(patch.fileName !== undefined ? { fileName: patch.fileName } : {}),
    },
  });

  await audit(actor, 'evidence', id, 'update', {
    before: { note: existing.note, transcript: existing.transcript, fileName: existing.fileName },
    after: { note: updated.note, transcript: updated.transcript, fileName: updated.fileName },
    meta: { activityId: existing.activityId, kind: existing.kind },
  });

  return updated;
}

export async function deleteEvidence(actor: Actor, id: string) {
  const existing = await prisma.evidence.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw notFound('Evidencia no encontrada');
  await getActivityForActor(actor, existing.activityId);

  await prisma.evidence.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  if (existing.fieldKey) {
    const act = await prisma.activity.findUnique({ where: { id: existing.activityId }, select: { data: true } });
    const data = (act?.data as Record<string, unknown>) || {};
    const cur = data[existing.fieldKey];
    if (Array.isArray(cur)) {
      const next = cur.filter((x) => x !== id);
      await prisma.activity.update({
        where: { id: existing.activityId },
        data: { data: { ...data, [existing.fieldKey]: next } as any },
      });
    }
  }

  await audit(actor, 'evidence', id, 'delete', {
    before: { kind: existing.kind, fileName: existing.fileName, fieldKey: existing.fieldKey, transcript: existing.transcript },
    meta: { activityId: existing.activityId },
  });

  return { id, deleted: true };
}
