// Tabelas do módulo Authorization: perfis, permissões, atribuições por escopo e autorização elevada.
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
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
import { userSession } from './auth';
import { organization, store } from './organizations';
import { appUser } from './users';

export const role = mysqlTable(
  'role',
  {
    id: uuidBinary('id').primaryKey(),
    /** NULL = perfil de sistema (ADMIN, GERENTE, CAIXA, GARCOM, COZINHA). */
    organizationId: uuidBinary('organization_id').references(() => organization.id),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 60 }).notNull(),
    /** Desconto máximo em pontos-base (RN-AUTHZ-08). */
    maxDiscountBp: int('max_discount_bp', { unsigned: true }).notNull().default(0),
    isSystem: boolean('is_system').notNull().default(false),
  },
  (table) => [uniqueIndex('uq_role_code').on(table.code)],
);

export const permission = mysqlTable('permission', {
  code: varchar('code', { length: 64 }).primaryKey(),
  description: varchar('description', { length: 160 }).notNull(),
});

export const rolePermission = mysqlTable(
  'role_permission',
  {
    roleId: uuidBinary('role_id')
      .notNull()
      .references(() => role.id),
    permissionCode: varchar('permission_code', { length: 64 })
      .notNull()
      .references(() => permission.code),
  },
  (table) => [
    primaryKey({ name: 'pk_role_permission', columns: [table.roleId, table.permissionCode] }),
  ],
);

export const scopeTypes = ['ORGANIZATION', 'COMPANY', 'STORE'] as const;

export const userRoleAssignment = mysqlTable(
  'user_role_assignment',
  {
    id: uuidBinary('id').primaryKey(),
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => appUser.id),
    roleId: uuidBinary('role_id')
      .notNull()
      .references(() => role.id),
    scopeType: mysqlEnum('scope_type', scopeTypes).notNull(),
    scopeId: uuidBinary('scope_id').notNull(),
    createdBy: uuidBinary('created_by'),
    createdAt: utcDatetime('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP(3))`),
  },
  (table) => [
    uniqueIndex('uq_user_role_assignment').on(
      table.userId,
      table.roleId,
      table.scopeType,
      table.scopeId,
    ),
    index('ix_user_role_assignment_scope').on(table.scopeType, table.scopeId),
  ],
);

/** Autorização do gerente: uso único, 60 s, presa à sessão de quem pediu (RN-AUTHZ-06). */
export const elevatedGrant = mysqlTable(
  'elevated_grant',
  {
    id: uuidBinary('id').primaryKey(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    permissionCode: varchar('permission_code', { length: 64 })
      .notNull()
      .references(() => permission.code),
    requesterUserId: uuidBinary('requester_user_id')
      .notNull()
      .references(() => appUser.id),
    requesterSessionId: uuidBinary('requester_session_id')
      .notNull()
      .references(() => userSession.id),
    authorizerUserId: uuidBinary('authorizer_user_id')
      .notNull()
      .references(() => appUser.id),
    createdAt: utcDatetime('created_at').notNull(),
    expiresAt: utcDatetime('expires_at').notNull(),
    usedAt: utcDatetime('used_at'),
  },
  (table) => [
    uniqueIndex('uq_elevated_grant_token').on(table.tokenHash),
    index('ix_elevated_grant_expires').on(table.expiresAt),
  ],
);

export type ScopeType = (typeof scopeTypes)[number];
