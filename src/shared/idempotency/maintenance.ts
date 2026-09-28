import { lt } from 'drizzle-orm';
import type { Database } from '../db/client';
import { idempotencyRecord } from './schema';

/** Retenção de 7 dias das chaves de idempotência (docs/api/convencoes.md §3). */
export const IDEMPOTENCY_RETENTION_DAYS = 7;

export async function purgeIdempotencyRecords(db: Database, now: Date): Promise<number> {
  const before = new Date(now.getTime() - IDEMPOTENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const [result] = await db
    .delete(idempotencyRecord)
    .where(lt(idempotencyRecord.createdAt, before));
  return result.affectedRows;
}
