import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../db';
import type { Actor } from '../types';

const IGNORED = new Set(['updatedAt', 'createdAt', 'passwordHash', 'version']);

/** Returns only the fields that changed between two snapshots. */
export function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return { before, after };
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (IGNORED.has(k)) continue;
    const vb = before[k];
    const va = after[k];
    if (JSON.stringify(vb) !== JSON.stringify(va)) {
      b[k] = vb;
      a[k] = va;
    }
  }
  return { before: b, after: a };
}

export async function audit(
  actor: Actor,
  entity: string,
  entityId: string,
  action: string,
  changes?: unknown,
  tx: Tx = prisma,
) {
  await tx.auditLog.create({
    data: {
      entity,
      entityId,
      action,
      userId: actor.userId,
      userName: actor.name,
      apiClientId: actor.apiClientId,
      ip: actor.ip ?? null,
      changes: (changes ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
