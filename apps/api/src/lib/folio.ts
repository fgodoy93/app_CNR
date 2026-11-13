import { formatFolio } from '@terreno/shared';
import type { Tx } from '../db';

/** Atomically increments the per-prefix/year counter and returns the next folio. */
export async function nextFolio(tx: Tx, prefix: string, date = new Date()): Promise<string> {
  const year = date.getFullYear();
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "FolioCounter" ("prefix", "year", "value") VALUES (${prefix}, ${year}, 1)
    ON CONFLICT ("prefix", "year") DO UPDATE SET "value" = "FolioCounter"."value" + 1
    RETURNING "value"`;
  return formatFolio(prefix, year, Number(rows[0]!.value));
}

const GEO_PREFIX = { POINT: 'PT', LINE: 'LN', TRACK: 'RC', POLYGON: 'PG' } as const;

export function nextGeoCode(tx: Tx, kind: keyof typeof GEO_PREFIX) {
  return nextFolio(tx, GEO_PREFIX[kind]);
}
