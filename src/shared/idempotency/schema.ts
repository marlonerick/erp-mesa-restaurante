import { sql } from 'drizzle-orm';
import {
  char,
  datetime,
  index,
  json,
  mysqlTable,
  primaryKey,
  varchar,
} from 'drizzle-orm/mysql-core';
import { store } from '../db/tables/organizations';
import { uuidBinary } from '../db/uuid-binary';

/**
 * Registro de comandos já executados (docs/api/convencoes.md §3).
 * Chave estrangeira para `store` adicionada na Etapa 3 (D-4).
 */
export const idempotencyRecord = mysqlTable(
  'idempotency_record',
  {
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    idemKey: varchar('idem_key', { length: 64 }).notNull(),
    operation: varchar('operation', { length: 64 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    response: json('response').$type<unknown>(),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 })
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP(3))`),
  },
  (table) => [
    primaryKey({ name: 'pk_idempotency_record', columns: [table.storeId, table.idemKey] }),
    index('ix_idempotency_record_created_at').on(table.createdAt),
  ],
);
