import * as Crypto from 'expo-crypto';
import { getDb } from '../db/sqlite';
import { apiFetch, getApiUrl, getDeviceId, getToken } from '../api/client';

export interface SyncSummary {
  pulledActivities: number;
  pushedMutations: number;
  uploadedEvidences: number;
}

export async function enqueueMutation(
  entity: 'activity' | 'geoFeature' | 'transition' | 'note',
  op: 'upsert' | 'delete' | 'execute',
  entityId: string,
  payload: Record<string, unknown>,
) {
  const db = await getDb();
  const mutationId = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO sync_queue (mutationId, entity, op, entityId, payload, clientTime, status) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
    [mutationId, entity, op, entityId, JSON.stringify(payload), new Date().toISOString()],
  );
}

export async function syncAll(): Promise<SyncSummary> {
  const db = await getDb();
  const deviceId = await getDeviceId();

  // 1. Push pending mutations
  const pending = await db.getAllAsync<{
    mutationId: string;
    entity: string;
    op: string;
    entityId: string;
    payload: string;
    clientTime: string;
  }>(`SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY clientTime ASC LIMIT 200`);

  let pushed = 0;
  if (pending.length > 0) {
    const res = await apiFetch<{ results: { mutationId: string; status: string; message?: string }[] }>(
      '/api/v1/sync/push',
      {
        method: 'POST',
        body: JSON.stringify({
          deviceId,
          mutations: pending.map((m) => ({
            mutationId: m.mutationId,
            entity: m.entity,
            op: m.op,
            entityId: m.entityId,
            payload: JSON.parse(m.payload),
            clientTime: m.clientTime,
          })),
        }),
      },
    );

    for (const r of res.results) {
      if (r.status === 'applied' || r.status === 'duplicate') {
        await db.runAsync(`DELETE FROM sync_queue WHERE mutationId = ?`, [r.mutationId]);
        pushed++;
      } else {
        await db.runAsync(`UPDATE sync_queue SET status = 'REJECTED', error = ? WHERE mutationId = ?`, [
          r.message || 'Rechazado',
          r.mutationId,
        ]);
      }
    }
  }

  // 2. Upload pending evidences
  const pendingEvidences = await db.getAllAsync<any>(`SELECT * FROM evidences WHERE synced = 0 LIMIT 50`);
  let uploadedEvidences = 0;
  const base = await getApiUrl();
  const token = await getToken();

  for (const ev of pendingEvidences) {
    const fd = new FormData();
    fd.append(
      'meta',
      JSON.stringify({
        id: ev.id,
        activityId: ev.activityId,
        kind: ev.kind,
        fieldKey: ev.fieldKey,
        fileName: ev.fileName,
        mimeType: ev.mimeType,
        note: ev.note,
        transcript: ev.transcript,
        source: ev.source,
        lat: ev.lat,
        lng: ev.lng,
        accuracy: ev.accuracy,
        capturedAt: ev.capturedAt,
      }),
    );
    if (ev.fileUri) {
      fd.append('file', {
        uri: ev.fileUri,
        name: ev.fileName || `${ev.id}.jpg`,
        type: ev.mimeType || 'image/jpeg',
      } as any);
    }

    const res = await fetch(`${base}/api/v1/evidences`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (res.ok) {
      await db.runAsync(`UPDATE evidences SET synced = 1 WHERE id = ?`, [ev.id]);
      uploadedEvidences++;
    }
  }

  // 3. Pull latest activities, types & form versions
  const pull = await apiFetch<{
    activities: any[];
    activityTypes: any[];
    formVersions: any[];
  }>('/api/v1/sync/pull');

  for (const t of pull.activityTypes) {
    await db.runAsync(
      `INSERT OR REPLACE INTO activity_types (id, key, name, prefix, formTemplateId) VALUES (?, ?, ?, ?, ?)`,
      [t.id, t.key, t.name, t.prefix, t.formTemplateId],
    );
  }

  for (const fv of pull.formVersions) {
    await db.runAsync(
      `INSERT OR REPLACE INTO form_versions (id, templateId, version, definition) VALUES (?, ?, ?, ?)`,
      [fv.id, fv.templateId, fv.version, JSON.stringify(fv.definition)],
    );
  }

  for (const a of pull.activities) {
    await db.runAsync(
      `INSERT OR REPLACE INTO activities (id, folio, typeId, typeName, title, description, priority, status, progress, formVersionId, data, externalRef, address, lat, lng, version, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id,
        a.folio,
        a.type.id,
        a.type.name,
        a.title,
        a.description,
        a.priority,
        a.status,
        a.progress,
        a.formVersionId,
        JSON.stringify(a.data || {}),
        a.externalRef,
        a.address,
        a.lat,
        a.lng,
        a.version,
        a.updatedAt,
      ],
    );
  }

  return {
    pulledActivities: pull.activities.length,
    pushedMutations: pushed,
    uploadedEvidences,
  };
}
