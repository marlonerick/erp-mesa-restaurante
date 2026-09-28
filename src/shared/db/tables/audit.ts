// Tabela do módulo Audit. Somente inclusão: triggers no banco recusam UPDATE e DELETE (E2-6).
// Sem chaves estrangeiras de propósito: o registro precisa sobreviver a qualquer outra tabela.
import { index, json, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { utcDatetime } from '../columns';
import { uuidBinary } from '../uuid-binary';

export const auditLog = mysqlTable(
  'audit_log',
  {
    id: uuidBinary('id').primaryKey(),
    organizationId: uuidBinary('organization_id'),
    storeId: uuidBinary('store_id'),
    event: varchar('event', { length: 64 }).notNull(),
    actorUserId: uuidBinary('actor_user_id'),
    authorizerUserId: uuidBinary('authorizer_user_id'),
    entityType: varchar('entity_type', { length: 40 }),
    entityId: varchar('entity_id', { length: 64 }),
    beforeData: json('before_data').$type<Record<string, unknown>>(),
    afterData: json('after_data').$type<Record<string, unknown>>(),
    ip: varchar('ip', { length: 45 }),
    userAgent: varchar('user_agent', { length: 255 }),
    requestId: varchar('request_id', { length: 64 }),
    occurredAt: utcDatetime('occurred_at').notNull(),
  },
  (table) => [
    index('ix_audit_log_store_time').on(table.storeId, table.occurredAt),
    index('ix_audit_log_entity').on(table.entityType, table.entityId),
    index('ix_audit_log_store_event_time').on(table.storeId, table.event, table.occurredAt),
  ],
);
