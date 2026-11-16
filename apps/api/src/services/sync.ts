import { prisma } from '../db';
import { syncMutations } from '../lib/metrics';
import { createActivity, updateActivity, executeTransition } from './activities';
import { addGeoFeature } from './geo';
import { deleteEvidence, updateEvidence } from './evidences';
import type { Actor } from '../types';
import type { SyncMutation, SyncResult } from '@terreno/shared';

export async function processSyncPush(
  actor: Actor,
  deviceId: string,
  mutations: SyncMutation[],
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const m of mutations) {
    // Check if mutation was already processed (idempotency)
    const existing = await prisma.syncMutation.findUnique({
      where: { mutationId: m.mutationId },
    });

    if (existing) {
      results.push({
        mutationId: m.mutationId,
        entityId: m.entityId,
        status: 'duplicate',
      });
      syncMutations.inc({ status: 'duplicate' });
      continue;
    }

    try {
      let serverVer: number | undefined;

      switch (m.entity) {
        case 'activity': {
          if (m.op === 'upsert') {
            const exists = await prisma.activity.findUnique({ where: { id: m.entityId }, select: { id: true } });
            if (exists) {
              const upd = await updateActivity(actor, m.entityId, m.payload as any, { allowStale: true });
              serverVer = upd.version;
            } else {
              const res = await createActivity(actor, {
                id: m.entityId,
                ...(m.payload as any),
              });
              serverVer = res.activity.version;
            }
          }
          break;
        }

        case 'geoFeature': {
          if (m.op === 'upsert') {
            await addGeoFeature(actor, {
              id: m.entityId,
              ...(m.payload as any),
            });
          }
          break;
        }

        case 'transition': {
          if (m.op === 'execute') {
            const p = m.payload as { activityId: string; transition: string; comment?: string };
            const updated = await executeTransition(actor, p.activityId, p.transition, p.comment);
            serverVer = updated.version;
          }
          break;
        }

        case 'evidence': {
          if (m.op === 'delete') {
            await deleteEvidence(actor, m.entityId);
          } else if (m.op === 'upsert') {
            await updateEvidence(actor, m.entityId, m.payload as any);
          }
          break;
        }
      }

      await prisma.syncMutation.create({
        data: {
          mutationId: m.mutationId,
          deviceId,
          userId: actor.userId || 'system',
          entity: m.entity,
          entityId: m.entityId,
          status: 'applied',
        },
      });

      results.push({
        mutationId: m.mutationId,
        entityId: m.entityId,
        status: 'applied',
        serverVersion: serverVer,
      });
      syncMutations.inc({ status: 'applied' });
    } catch (err: any) {
      await prisma.syncMutation.create({
        data: {
          mutationId: m.mutationId,
          deviceId,
          userId: actor.userId || 'system',
          entity: m.entity,
          entityId: m.entityId,
          status: 'rejected',
          message: err.message?.slice(0, 500),
        },
      });

      results.push({
        mutationId: m.mutationId,
        entityId: m.entityId,
        status: 'rejected',
        message: err.message,
      });
      syncMutations.inc({ status: 'rejected' });
    }
  }

  return results;
}
