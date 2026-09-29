// Terminais da loja (módulo Organizations, Etapa 3). Arquivo separado porque liga a loja
// (organizations.ts) ao aparelho (auth.ts), que já depende da loja — evita importação circular.
import { boolean, mysqlEnum, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { timestamps, version } from '../columns';
import { uuidBinary } from '../uuid-binary';
import { knownDevice } from './auth';
import { store } from './organizations';

export const TERMINAL_KINDS = ['CAIXA', 'KDS', 'MOVEL'] as const;

export const terminal = mysqlTable(
  'terminal',
  {
    id: uuidBinary('id').primaryKey(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 60 }).notNull(),
    kind: mysqlEnum('kind', TERMINAL_KINDS).notNull(),
    /** Aparelho vinculado (RN-ORG-09). Único: um aparelho é no máximo um terminal. */
    deviceId: uuidBinary('device_id').references(() => knownDevice.id),
    active: boolean('active').notNull().default(true),
    version: version(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_terminal_store_code').on(table.storeId, table.code),
    uniqueIndex('uq_terminal_device').on(table.deviceId),
  ],
);
