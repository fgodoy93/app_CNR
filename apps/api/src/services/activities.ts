import type { Activity, Prisma } from '@prisma/client';
import {
  DEFAULT_WORKFLOW,
  canExecuteTransition,
  formSchemaDefinition,
  getState,
  hasPermission,
  validateFormValues,
  workflowDefinitionSchema,
  type ActivityCreateInput,
  type FormDefinition,
  type WorkflowDefinition,
} from '@terreno/shared';
import { prisma, type Tx } from '../db';
import { audit, diff } from '../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { nextFolio } from '../lib/folio';
import { notifyUsers } from '../lib/notifications';
import type { Actor } from '../types';
import { runTransitionActions } from './workflow-actions';
import { emitEvent } from './webhooks';

export function activityScope(actor: Actor): Prisma.ActivityWhereInput {
  const base: Prisma.ActivityWhereInput = { deletedAt: null };
  const p = actor.permissions;
  if (hasPermission(p, 'activities.read.all')) return base;
  const or: Prisma.ActivityWhereInput[] = [];
  if (actor.userId) or.push({ assigneeId: actor.userId }, { createdById: actor.userId });
  if (hasPermission(p, 'activities.read.unit') && actor.unitId) or.push({ unitId: actor.unitId });
  if (or.length === 0) return { ...base, id: '__none__' };
  return { ...base, OR: or };
}

export const activityInclude = {
  type: { select: { id: true, key: true, name: true, prefix: true, color: true, icon: true, workflowId: true, formTemplateId: true } },
  assignee: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  unit: { select: { id: true, code: true, name: true } },
  parent: { select: { id: true, folio: true, title: true, status: true, type: { select: { name: true, prefix: true, color: true } } } },
  _count: {
    select: {
      evidences: { where: { deletedAt: null } },
      geoFeatures: { where: { deletedAt: null } },
      children: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.ActivityInclude;

export async function loadWorkflow(typeId: string, tx: Tx = prisma): Promise<WorkflowDefinition> {
  const type = await tx.activityType.findUnique({ where: { id: typeId }, include: { workflow: true } });
  if (!type) throw notFound('Tipo de actividad no encontrado');
  if (!type.workflow) return DEFAULT_WORKFLOW;
  return workflowDefinitionSchema.parse(type.workflow.definition);
}

export async function loadFormDefinition(formVersionId: string | null, tx: Tx = prisma): Promise<FormDefinition | null> {
  if (!formVersionId) return null;
  const v = await tx.formVersion.findUnique({ where: { id: formVersionId } });
  return v ? formSchemaDefinition.parse(v.definition) : null;
}

export async function getActivityForActor(actor: Actor, idOrFolio: string, tx: Tx = prisma) {
  const a = await tx.activity.findFirst({
    where: { AND: [activityScope(actor), { OR: [{ id: idOrFolio }, { folio: idOrFolio }] }] },
    include: activityInclude,
  });
  if (!a) throw notFound('Actividad no encontrada');
  return a;
}

export async function createActivity(actor: Actor, input: ActivityCreateInput, tx: Tx = prisma) {
  if (!hasPermission(actor.permissions, 'activities.create')) throw forbidden('No puede crear actividades');
  const type = await tx.activityType.findUnique({ where: { id: input.typeId }, include: { formTemplate: true } });
  if (!type || !type.active) throw badRequest('Tipo de actividad inválido');

  if (input.id) {
    const existing = await tx.activity.findUnique({ where: { id: input.id }, include: activityInclude });
    if (existing) return { activity: existing, created: false };
  }
  if (input.externalSource && input.externalRef) {
    const existing = await tx.activity.findUnique({
      where: { externalSource_externalRef: { externalSource: input.externalSource, externalRef: input.externalRef } },
      include: activityInclude,
    });
    if (existing) return { activity: existing, created: false };
  }

  const workflow = await loadWorkflow(type.id, tx);
  let formVersionId: string | null = null;
  if (type.formTemplate && type.formTemplate.currentVersion > 0) {
    const v = await tx.formVersion.findUnique({
      where: { templateId_version: { templateId: type.formTemplate.id, version: type.formTemplate.currentVersion } },
    });
    formVersionId = v?.id ?? null;
  }

  const parent = input.parentId
    ? await tx.activity.findFirst({
        where: { id: input.parentId, deletedAt: null },
        select: { id: true, unitId: true, lat: true, lng: true, address: true },
      })
    : null;
  if (input.parentId && !parent) throw notFound('OT principal no encontrada');

  const folio = await nextFolio(tx, type.prefix);
  const activity = await tx.activity.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      parentId: parent?.id ?? null,
      folio,
      typeId: type.id,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? 'MEDIA',
      status: workflow.initial,
      assigneeId: input.assigneeId ?? null,
      createdById: actor.userId,
      unitId: input.unitId ?? parent?.unitId ?? type.unitId ?? actor.unitId ?? null,
      formVersionId,
      data: (input.data ?? {}) as Prisma.InputJsonValue,
      externalData: (input.externalData ?? {}) as Prisma.InputJsonValue,
      externalRef: input.externalRef ?? null,
      externalSource: input.externalSource ?? null,
      lat: input.lat ?? parent?.lat ?? null,
      lng: input.lng ?? parent?.lng ?? null,
      address: input.address ?? parent?.address ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    },
    include: activityInclude,
  });
  await audit(actor, 'activity', activity.id, 'create', { after: { folio, title: activity.title, status: activity.status } }, tx);
  await notifyUsers(
    {
      userIds: [activity.assigneeId],
      excludeUserId: actor.userId,
      title: `Nueva actividad asignada: ${folio}`,
      body: activity.title,
      link: `/actividades/${activity.id}`,
    },
    tx,
  );
  await emitEvent('activity.created', serializeActivity(activity), tx);
  return { activity, created: true };
}

/** Executes "asignar" automatically when an activity is created with an assignee. */
export async function autoAssign(actor: Actor, activityId: string) {
  const a = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!a?.assigneeId) return;
  const wf = await loadWorkflow(a.typeId);
  const t = wf.transitions.find((x) => x.key === 'asignar' && (x.from.includes(a.status) || x.from.includes('*')));
  if (!t) return;
  await executeTransition({ ...actor, permissions: ['*'] }, a.id, t.key, undefined, { skipScope: true });
}

const EDITABLE: (keyof Activity)[] = ['title', 'description', 'priority', 'assigneeId', 'unitId', 'dueAt', 'scheduledAt', 'lat', 'lng', 'address', 'data', 'externalData', 'progress', 'externalRef', 'externalSource'];

export async function updateActivity(
  actor: Actor,
  id: string,
  patch: Record<string, unknown> & { baseVersion?: number },
  opts: { allowStale?: boolean } = {},
) {
  const current = await getActivityForActor(actor, id);
  const canWrite = hasPermission(actor.permissions, 'activities.write');
  const isAssignee = actor.userId && current.assigneeId === actor.userId;
  if (!canWrite && !isAssignee) throw forbidden();
  if ((patch.assigneeId !== undefined && patch.assigneeId !== current.assigneeId) || (patch.priority !== undefined && patch.priority !== current.priority)) {
    if (!hasPermission(actor.permissions, 'activities.assign')) throw forbidden('No puede reasignar ni priorizar');
  }
  const wf = await loadWorkflow(current.typeId);
  if (getState(wf, current.status)?.final) throw conflict('La actividad está cerrada y no admite cambios');
  if (!opts.allowStale && patch.baseVersion !== undefined && patch.baseVersion < current.version) {
    // field-level merge: only reject when the same form keys were modified on the server
    if (patch.data === undefined || Object.keys(patch).some((k) => !['data', 'baseVersion', 'progress'].includes(k))) {
      throw conflict('La actividad fue modificada por otro usuario. Recargue antes de guardar.', { serverVersion: current.version });
    }
  }

  const data: Prisma.ActivityUncheckedUpdateInput = {};
  for (const k of EDITABLE) {
    if (patch[k] === undefined) continue;
    if (k === 'dueAt' || k === 'scheduledAt') (data as Record<string, unknown>)[k] = patch[k] ? new Date(String(patch[k])) : null;
    else if (k === 'data') data.data = { ...(current.data as object), ...(patch.data as object) } as Prisma.InputJsonValue;
    else if (k === 'externalData') data.externalData = { ...(current.externalData as object), ...(patch.externalData as object) } as Prisma.InputJsonValue;
    else (data as Record<string, unknown>)[k] = patch[k];
  }
  data.version = { increment: 1 };

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.activity.update({ where: { id: current.id }, data, include: activityInclude });
    await audit(actor, 'activity', u.id, 'update', diff(snapshot(current), snapshot(u)), tx);
    if (patch.assigneeId && patch.assigneeId !== current.assigneeId) {
      await notifyUsers(
        {
          userIds: [String(patch.assigneeId)],
          excludeUserId: actor.userId,
          title: `OT asignada: ${u.folio}`,
          body: u.title,
          link: `/actividades/${u.id}`,
        },
        tx,
      );
    } else if (patch.data !== undefined) {
      await notifyUsers(
        {
          userIds: [current.createdById, u.assigneeId],
          excludeUserId: actor.userId,
          title: `Avance registrado en ${u.folio}`,
          body: `${actor.name || 'Usuario'} actualizó el formulario de "${u.title}"`,
          link: `/actividades/${u.id}`,
        },
        tx,
      );
    }
    await emitEvent('activity.updated', serializeActivity(u), tx);
    return u;
  });

  if (patch.assigneeId && patch.assigneeId !== current.assigneeId) await autoAssign(actor, current.id);
  return updated;
}

function snapshot(a: Activity) {
  return Object.fromEntries(EDITABLE.map((k) => [k, a[k] instanceof Date ? (a[k] as Date).toISOString() : a[k]]).concat([['status', a.status]]));
}

export async function executeTransition(
  actor: Actor,
  id: string,
  transitionKey: string,
  comment?: string,
  opts: { skipScope?: boolean } = {},
) {
  const current = opts.skipScope
    ? await prisma.activity.findUniqueOrThrow({ where: { id }, include: activityInclude })
    : await getActivityForActor(actor, id);
  const wf = await loadWorkflow(current.typeId);
  const t = wf.transitions.find((x) => x.key === transitionKey);
  if (!t) throw badRequest(`Transición desconocida: ${transitionKey}`);

  let formValid = true;
  let formErrors: Record<string, string> = {};
  if (t.requireValidForm) {
    const def = await loadFormDefinition(current.formVersionId);
    if (def) {
      formErrors = validateFormValues(def, current.data as Record<string, unknown>, {
        activity: current as unknown as Record<string, unknown>,
      });
      formValid = Object.keys(formErrors).length === 0;
    }
  }
  const check = canExecuteTransition(wf, t, { status: current.status, assigneeId: current.assigneeId }, actor, { comment, formValid });
  if (!check.ok) throw badRequest(check.reason ?? 'Transición no permitida', formValid ? undefined : { formErrors });

  const target = getState(wf, t.to)!;
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const data: Prisma.ActivityUncheckedUpdateInput = { status: t.to, version: { increment: 1 } };
    if (target.category === 'in_progress' && !current.startedAt) data.startedAt = now;
    if (target.category === 'review' && !current.completedAt) data.completedAt = now;
    if (target.final) data.closedAt = now;
    const u = await tx.activity.update({ where: { id: current.id }, data, include: activityInclude });
    await tx.activityTransition.create({
      data: {
        activityId: current.id,
        transitionKey: t.key,
        label: t.label,
        fromStatus: current.status,
        toStatus: t.to,
        approvalLevel: t.approvalLevel ?? null,
        comment: comment ?? null,
        userId: actor.userId,
        apiClientId: actor.apiClientId,
      },
    });
    await audit(actor, 'activity', current.id, `transition:${t.key}`, { before: { status: current.status }, after: { status: t.to }, comment }, tx);
    await emitEvent('activity.status_changed', { ...serializeActivity(u), transition: t.key, from: current.status, to: t.to, comment }, tx);
    return u;
  });

  await runTransitionActions(actor, updated, t, comment);
  return prisma.activity.findUniqueOrThrow({ where: { id: current.id }, include: activityInclude });
}

export type ActivityWithRelations = Prisma.ActivityGetPayload<{ include: typeof activityInclude }>;

export function serializeActivity(a: ActivityWithRelations) {
  return {
    id: a.id,
    folio: a.folio,
    parentId: a.parentId,
    parent: a.parent ?? null,
    title: a.title,
    description: a.description,
    priority: a.priority,
    status: a.status,
    progress: a.progress,
    type: a.type,
    assignee: a.assignee,
    createdBy: a.createdBy,
    unit: a.unit,
    formVersionId: a.formVersionId,
    data: a.data,
    externalData: a.externalData,
    externalRef: a.externalRef,
    externalSource: a.externalSource,
    lat: a.lat,
    lng: a.lng,
    address: a.address,
    scheduledAt: a.scheduledAt,
    dueAt: a.dueAt,
    startedAt: a.startedAt,
    completedAt: a.completedAt,
    closedAt: a.closedAt,
    version: a.version,
    evidenceCount: a._count?.evidences ?? 0,
    geoFeatureCount: a._count?.geoFeatures ?? 0,
    childrenCount: a._count?.children ?? 0,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
