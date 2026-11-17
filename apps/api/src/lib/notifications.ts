import type { Tx } from '../db';
import { prisma } from '../db';

export async function notifyUsers(
  opts: {
    userIds: (string | null | undefined)[];
    excludeUserId?: string | null;
    title: string;
    body?: string | null;
    link?: string | null;
  },
  tx: Tx = prisma,
) {
  const unique = Array.from(
    new Set(
      opts.userIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0 && id !== opts.excludeUserId,
      ),
    ),
  );
  if (unique.length === 0) return;

  await tx.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      title: opts.title,
      body: opts.body ?? null,
      link: opts.link ?? null,
    })),
  });
}
