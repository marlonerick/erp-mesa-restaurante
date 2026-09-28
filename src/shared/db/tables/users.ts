// Tabela do módulo Users. O nome físico é `app_user` porque `user` é palavra-chave do MySQL.
import {
  boolean,
  index,
  mysqlEnum,
  mysqlTable,
  smallint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { timestamps, utcDatetime, version } from '../columns';
import { uuidBinary } from '../uuid-binary';
import { organization } from './organizations';

export const appUser = mysqlTable(
  'app_user',
  {
    id: uuidBinary('id').primaryKey(),
    organizationId: uuidBinary('organization_id')
      .notNull()
      .references(() => organization.id),
    name: varchar('name', { length: 120 }).notNull(),
    /** Sempre em minúsculas; único no sistema (RN-AUTH-01). */
    username: varchar('username', { length: 50 }).notNull(),
    /** Hash Argon2id — nunca a senha (RN-AUTH-02). */
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    pinHash: varchar('pin_hash', { length: 255 }),
    status: mysqlEnum('status', ['ATIVO', 'DESATIVADO']).notNull().default('ATIVO'),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    failedPinAttempts: smallint('failed_pin_attempts', { unsigned: true }).notNull().default(0),
    pinLockedAt: utcDatetime('pin_locked_at'),
    passwordChangedAt: utcDatetime('password_changed_at').notNull(),
    disabledAt: utcDatetime('disabled_at'),
    createdBy: uuidBinary('created_by'),
    version: version(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_app_user_username').on(table.username),
    index('ix_app_user_organization').on(table.organizationId),
  ],
);
