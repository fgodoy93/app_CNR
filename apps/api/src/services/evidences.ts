import { prisma } from '../db';
import { config } from '../config';
import { storage } from '../lib/storage';
import { sha256 } from '../lib/crypto';
import { getActivityForActor } from './activities';
import { badRequest } from '../lib/errors';
import type { Actor } from '../types';
import type { EvidenceKind } from '@prisma/client';

async function transcribeAudioAsync(evidenceId: string, fileBuffer: Buffer, fileName: string, mimeType: string) {
  if (!config.STT_API_URL) return;
  try {
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), fileName);
    fd.append('model', config.STT_MODEL);
    fd.append('language', 'es');
    const headers: Record<string, string> = {};
    if (config.STT_API_KEY) headers.Authorization = `Bearer ${config.STT_API_KEY}`;

    const res = await fetch(config.STT_API_URL, {
      method: 'POST',
      headers,
      body: fd,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { text?: string };
    const text = data?.text?.trim();
    if (text) {
      await prisma.evidence.update({ where: { id: evidenceId }, data: { transcript: text } });
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

  if (input.kind === 'AUDIO' && !input.transcript && fileBuffer && fileBuffer.length > 0 && config.STT_API_URL) {
    void transcribeAudioAsync(
      created.id,
      fileBuffer,
      input.fileName || `${created.id}.m4a`,
      input.mimeType || 'audio/mp4',
    );
  }

  return created;
}
