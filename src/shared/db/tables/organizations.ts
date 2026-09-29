// Tabelas do módulo Organizations (parte mínima da Etapa 2 — decisão E2-1).
// Caminhos relativos: o drizzle-kit não entende o atalho "@/".
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  smallint,
  time,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { timestamps, version } from '../columns';
import { uuidBinary } from '../uuid-binary';

const recordStatus = ['ATIVO', 'INATIVO'] as const;
export const NEGATIVE_STOCK_POLICIES = ['PERMITIR_COM_ALERTA', 'BLOQUEAR'] as const;

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
    version: version(),
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
    // Configurações da loja (RN-ORG-04, Etapa 3)
    /** Virada do dia operacional, horário LOCAL da loja (ADR-0013). */
    operationalDayCutoff: time('operational_day_cutoff').notNull().default('05:00:00'),
    /** Taxa de serviço em pontos-base: 1000 = 10% (ADR-0003). */
    serviceFeeBp: int('service_fee_bp', { unsigned: true }).notNull().default(1000),
    negativeStockPolicy: mysqlEnum('negative_stock_policy', NEGATIVE_STOCK_POLICIES)
      .notNull()
      .default('PERMITIR_COM_ALERTA'),
    /** Quantos caixas podem ficar abertos ao mesmo tempo na loja (Q-05; usado na Etapa 8). */
    maxOpenCashSessions: smallint('max_open_cash_sessions', { unsigned: true })
      .notNull()
      .default(1),
    status: mysqlEnum('status', recordStatus).notNull().default('ATIVO'),
    version: version(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_store_company_code').on(table.companyId, table.code),
    index('ix_store_organization').on(table.organizationId),
    check('ck_store_service_fee_bp', sql`${table.serviceFeeBp} <= 10000`),
    check('ck_store_max_open_cash_sessions', sql`${table.maxOpenCashSessions} BETWEEN 1 AND 20`),
  ],
);

/** Estação de preparo (praça). O MVP usa só a padrão "Cozinha" (RN-ORG-10). */
export const kitchenStation = mysqlTable(
  'kitchen_station',
  {
    id: uuidBinary('id').primaryKey(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    name: varchar('name', { length: 60 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    /** Coluna calculada: a loja, só na estação padrão — o índice único garante UMA padrão por loja. */
    defaultStoreId: uuidBinary('default_store_id').generatedAlwaysAs(
      sql`(if(\`is_default\`, \`store_id\`, NULL))`,
      { mode: 'stored' },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_kitchen_station_store_name').on(table.storeId, table.name),
    uniqueIndex('uq_kitchen_station_default').on(table.defaultStoreId),
  ],
);
