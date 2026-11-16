import { prisma } from '../db';
import { activityScope, getActivityForActor } from './activities';
import { nextGeoCode } from '../lib/folio';
import { validateGeometry, type GeoKind, type Geometry } from '@terreno/shared';
import { badRequest, notFound } from '../lib/errors';
import type { Actor } from '../types';

export async function addGeoFeature(
  actor: Actor,
  input: {
    id: string;
    activityId: string;
    kind: GeoKind;
    geometry: Geometry;
    fieldKey?: string | null;
    label?: string | null;
    description?: string | null;
    status?: string | null;
    observations?: string | null;
    accuracy?: number | null;
    altitude?: number | null;
    capturedAt: string | Date;
  },
) {
  // Ensure the user has access to the activity
  await getActivityForActor(actor, input.activityId);

  const geomErr = validateGeometry(input.kind, input.geometry);
  if (geomErr) throw badRequest(geomErr);

  // If already exists with this ID (offline sync retry), return existing
  const existing = await prisma.geoFeature.findUnique({ where: { id: input.id } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const code = await nextGeoCode(tx, input.kind);
    return tx.geoFeature.create({
      data: {
        id: input.id,
        code,
        activityId: input.activityId,
        kind: input.kind,
        geometry: input.geometry as object,
        fieldKey: input.fieldKey || null,
        label: input.label || null,
        description: input.description || null,
        status: input.status || null,
        observations: input.observations || null,
        accuracy: input.accuracy || null,
        altitude: input.altitude || null,
        capturedAt: new Date(input.capturedAt),
        capturedById: actor.userId,
      },
    });
  });
}

export async function listGeoFeaturesForMap(actor: Actor) {
  const activities = await prisma.activity.findMany({
    where: activityScope(actor),
    select: { id: true, folio: true, title: true },
  });

  const actMap = new Map(activities.map((a) => [a.id, a]));
  const actIds = Array.from(actMap.keys());

  const features = await prisma.geoFeature.findMany({
    where: {
      activityId: { in: actIds },
      deletedAt: null,
    },
    include: {
      evidences: {
        where: { deletedAt: null },
        select: { id: true, storageKey: true },
      },
    },
    orderBy: { capturedAt: 'desc' },
  });

  return features.map((f) => {
    const act = actMap.get(f.activityId);
    return {
      id: f.id,
      code: f.code,
      kind: f.kind,
      geometry: f.geometry as any,
      label: f.label,
      description: f.description,
      status: f.status,
      observations: f.observations,
      accuracy: f.accuracy,
      capturedAt: f.capturedAt,
      capturedBy: f.capturedById,
      activityId: f.activityId,
      activityFolio: act?.folio || '',
      activityTitle: act?.title || '',
      evidenceCount: f.evidences.length,
    };
  });
}

export async function deleteGeoFeature(actor: Actor, id: string) {
  const existing = await prisma.geoFeature.findUnique({ where: { id } });
  if (!existing) throw notFound('Geometría no encontrada');
  await getActivityForActor(actor, existing.activityId);
  await prisma.geoFeature.delete({ where: { id } });
  return { ok: true };
}

export async function clearActivityGeoFeatures(actor: Actor, activityId: string) {
  await getActivityForActor(actor, activityId);
  const res = await prisma.geoFeature.deleteMany({ where: { activityId } });
  return { ok: true, deleted: res.count };
}
