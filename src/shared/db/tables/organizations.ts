// Tabelas do módulo Organizations (parte mínima da Etapa 2 — decisão E2-1).
// Caminhos relativos: o drizzle-kit não entende o atalho "@/".
import { char, index, mysqlEnum, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { timestamps, version } from '../columns';
import { uuidBinary } from '../uuid-binary';

const recordStatus = ['ATIVO', 'INATIVO'] as const;

export const organization = mysqlTable('organization', {
  id: uuidBinary('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  status: mysqlEnum('status', recordStatus).notNull().default('ATIVO'),
  ...timestamps,
});

export const company = mysqlTable(
  'company',
  {
    id: uuidBinary('id').primaryKey(),
    organizationId: uuidBinary('organization_id')
      .notNull()
      .references(() => organization.id),
    legalName: varchar('legal_name', { length: 150 }).notNull(),
    tradeName: varchar('trade_name', { length: 120 }).notNull(),
    cnpj: char('cnpj', { length: 14 }),
    status: mysqlEnum('status', recordStatus).notNull().default('ATIVO'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_company_cnpj').on(table.cnpj),
    index('ix_company_organization').on(table.organizationId),
  ],
);

export const store = mysqlTable(
  'store',
  {
    id: uuidBinary('id').primaryKey(),
    organizationId: uuidBinary('organization_id')
      .notNull()
      .references(() => organization.id),
    companyId: uuidBinary('company_id')
      .notNull()
      .references(() => company.id),
    name: varchar('name', { length: 120 }).notNull(),
    code: varchar('code', { length: 20 }).notNull(),
    timezone: varchar('timezone', { length: 64 }).notNull().default('America/Sao_Paulo'),
    status: mysqlEnum('status', recordStatus).notNull().default('ATIVO'),
    version: version(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_store_company_code').on(table.companyId, table.code),
    index('ix_store_organization').on(table.organizationId),
  ],
);
