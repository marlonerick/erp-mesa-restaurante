// Tabelas do módulo Auth: sessões, aparelhos conhecidos e limite de tentativas.
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { utcDatetime } from '../columns';
import { uuidBinary } from '../uuid-binary';
import { store } from './organizations';
import { appUser } from './users';

/** Aparelho identificado por cookie próprio (RN-AUTH-13). Guarda só o hash do token. */
export const knownDevice = mysqlTable(
  'known_device',
  {
    id: uuidBinary('id').primaryKey(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    shared: boolean('shared').notNull().default(false),
    createdAt: utcDatetime('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP(3))`),
    lastSeenAt: utcDatetime('last_seen_at').notNull(),
  },
  (table) => [uniqueIndex('uq_known_device_token').on(table.tokenHash)],
);

/** Quem já entrou COM SENHA em cada aparelho — base da troca rápida (RN-AUTH-11). */
export const deviceUser = mysqlTable(
  'device_user',
  {
    deviceId: uuidBinary('device_id')
      .notNull()
      .references(() => knownDevice.id),
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => appUser.id),
    lastPasswordLoginAt: utcDatetime('last_password_login_at').notNull(),
  },
  (table) => [primaryKey({ name: 'pk_device_user', columns: [table.deviceId, table.userId] })],
);

export const userSession = mysqlTable(
  'user_session',
  {
    id: uuidBinary('id').primaryKey(),
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => appUser.id),
    /** SHA-256 do token do cookie (RN-AUTH-05). */
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    organizationId: uuidBinary('organization_id').notNull(),
    activeStoreId: uuidBinary('active_store_id')
      .notNull()
      .references(() => store.id),
    deviceId: uuidBinary('device_id').references(() => knownDevice.id),
    loginMethod: mysqlEnum('login_method', ['PASSWORD', 'PIN']).notNull(),
    /** 12 h (43 200 s) ou 3 min (180 s) em aparelho compartilhado (RN-AUTH-06). */
    idleTimeoutSeconds: int('idle_timeout_seconds', { unsigned: true }).notNull(),
    ip: varchar('ip', { length: 45 }),
    userAgent: varchar('user_agent', { length: 255 }),
    createdAt: utcDatetime('created_at').notNull(),
    lastSeenAt: utcDatetime('last_seen_at').notNull(),
    /** Limite absoluto de 7 dias. */
    expiresAt: utcDatetime('expires_at').notNull(),
    revokedAt: utcDatetime('revoked_at'),
    revokeReason: varchar('revoke_reason', { length: 30 }),
  },
  (table) => [
    uniqueIndex('uq_user_session_token').on(table.tokenHash),
    index('ix_user_session_user').on(table.userId, table.revokedAt),
    index('ix_user_session_device').on(table.deviceId, table.revokedAt),
    index('ix_user_session_expires').on(table.expiresAt),
  ],
);

/** Contadores de tentativas por janela de tempo, sem Redis (ADR-0002). */
export const rateLimitBucket = mysqlTable(
  'rate_limit_bucket',
  {
    bucketKey: varchar('bucket_key', { length: 191 }).notNull(),
    windowStart: datetime('window_start', { mode: 'date' }).notNull(),
    hits: int('hits', { unsigned: true }).notNull().default(0),
  },
  (table) => [
    primaryKey({ name: 'pk_rate_limit_bucket', columns: [table.bucketKey, table.windowStart] }),
  ],
);
