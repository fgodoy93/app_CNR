import { formatFolio } from '@terreno/shared';
import type { Tx } from '../db';

/** Atomically increments the per-prefix/year counter and returns the next unused folio or geo code. */
export async function nextFolio(
  tx: Tx,
  prefix: string,
  date = new Date(),
  target: 'activity' | 'geo' = 'activity',
): Promise<string> {
  const year = date.getFullYear();
  while (true) {
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO "FolioCounter" ("prefix", "year", "value") VALUES (${prefix}, ${year}, 1)
      ON CONFLICT ("prefix", "year") DO UPDATE SET "value" = "FolioCounter"."value" + 1
      RETURNING "value"`;
    const candidate = formatFolio(prefix, year, Number(rows[0]!.value));
    const existing =
      target === 'geo'
        ? await tx.geoFeature.findUnique({ where: { code: candidate }, select: { id: true } })
        : await tx.activity.findUnique({ where: { folio: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
}

const GEO_PREFIX = { POINT: 'PT', LINE: 'LN', TRACK: 'RC', POLYGON: 'PG' } as const;

export function nextGeoCode(tx: Tx, kind: keyof typeof GEO_PREFIX) {
  return nextFolio(tx, GEO_PREFIX[kind], new Date(), 'geo');
}
