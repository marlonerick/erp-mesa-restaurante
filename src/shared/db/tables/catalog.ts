// Tabelas do módulo Catalog (Etapa 4 — docs/modules/catalog.md §9).
// Caminhos relativos: o drizzle-kit não entende o atalho "@/".
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  int,
  mysqlTable,
  primaryKey,
  smallint,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { timestamps, version } from '../columns';
import { uuidBinary } from '../uuid-binary';
import { company, store } from './organizations';

/** Categoria do cardápio da EMPRESA (RN-CAT-02). Desativada, nunca apagada. */
export const category = mysqlTable(
  'category',
  {
    id: uuidBinary('id').primaryKey(),
    companyId: uuidBinary('company_id')
      .notNull()
      .references(() => company.id),
    name: varchar('name', { length: 60 }).notNull(),
    /** Posição no cardápio (menor primeiro). */
    sortOrder: smallint('sort_order', { unsigned: true }).notNull().default(0),
    active: boolean('active').notNull().default(true),
    version: version(),
    ...timestamps,
  },
  (table) => [uniqueIndex('uq_category_company_name').on(table.companyId, table.name)],
);

/** Produto da EMPRESA (RN-CAT-04). Vendido por unidade (Q-10). Desativado, nunca apagado (E4-2). */
export const product = mysqlTable(
  'product',
  {
    id: uuidBinary('id').primaryKey(),
    companyId: uuidBinary('company_id')
      .notNull()
      .references(() => company.id),
    categoryId: uuidBinary('category_id')
      .notNull()
      .references(() => category.id),
    name: varchar('name', { length: 80 }).notNull(),
    /** Código opcional (E4-4); NULL não conflita no índice único. */
    sku: varchar('sku', { length: 30 }),
    description: varchar('description', { length: 300 }),
    /** Vai para a cozinha (KDS)? Refrigerante e água não vão (Q-08). */
    requiresPreparation: boolean('requires_preparation').notNull().default(true),
    active: boolean('active').notNull().default(true),
    version: version(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_product_company_name').on(table.companyId, table.name),
    uniqueIndex('uq_product_company_sku').on(table.companyId, table.sku),
    index('ix_product_category').on(table.categoryId),
  ],
);

/**
 * Preço e disponibilidade do produto NA LOJA (RN-CAT-07, RN-CAT-09). Sem linha = não vendido na
 * loja. Preço em centavos inteiros (ADR-0003).
 */
export const productStore = mysqlTable(
  'product_store',
  {
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    productId: uuidBinary('product_id')
      .notNull()
      .references(() => product.id),
    priceCents: int('price_cents', { unsigned: true }).notNull(),
    /** "Acabou" = false. Não muda a versão: é valor absoluto (RN-CAT-09). */
    available: boolean('available').notNull().default(true),
    version: version(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ name: 'product_store_pk', columns: [table.storeId, table.productId] }),
    // Índice próprio para a FK (sem ele o MySQL cria um com nome automático — S-3 da Etapa 3)
    index('ix_product_store_product').on(table.productId),
    check('ck_product_store_price', sql`${table.priceCents} <= 9999999`),
  ],
);

/** Grupo de adicionais da EMPRESA (RN-CAT-11), ex.: "Ponto da carne" (mín. 1, máx. 1). */
export const modifierGroup = mysqlTable(
  'modifier_group',
  {
    id: uuidBinary('id').primaryKey(),
    companyId: uuidBinary('company_id')
      .notNull()
      .references(() => company.id),
    name: varchar('name', { length: 60 }).notNull(),
    minSelect: tinyint('min_select', { unsigned: true }).notNull().default(0),
    maxSelect: tinyint('max_select', { unsigned: true }).notNull().default(1),
    active: boolean('active').notNull().default(true),
    version: version(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_modifier_group_company_name').on(table.companyId, table.name),
    check('ck_modifier_group_limits', sql`${table.minSelect} <= ${table.maxSelect}`),
    check('ck_modifier_group_max', sql`${table.maxSelect} BETWEEN 1 AND 10`),
  ],
);

/** Opção do grupo, com preço extra ÚNICO na empresa (RN-CAT-12, Q-09). */
export const modifier = mysqlTable(
  'modifier',
  {
    id: uuidBinary('id').primaryKey(),
    modifierGroupId: uuidBinary('modifier_group_id')
      .notNull()
      .references(() => modifierGroup.id),
    name: varchar('name', { length: 60 }).notNull(),
    priceDeltaCents: int('price_delta_cents', { unsigned: true }).notNull().default(0),
    active: boolean('active').notNull().default(true),
    version: version(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_modifier_group_name').on(table.modifierGroupId, table.name),
    check('ck_modifier_price', sql`${table.priceDeltaCents} <= 999999`),
  ],
);

/** Grupos de adicionais de cada produto (RN-CAT-06). */
export const productModifierGroup = mysqlTable(
  'product_modifier_group',
  {
    productId: uuidBinary('product_id')
      .notNull()
      .references(() => product.id),
    modifierGroupId: uuidBinary('modifier_group_id')
      .notNull()
      .references(() => modifierGroup.id),
  },
  (table) => [
    primaryKey({
      name: 'product_modifier_group_pk',
      columns: [table.productId, table.modifierGroupId],
    }),
    index('ix_product_modifier_group_group').on(table.modifierGroupId),
  ],
);
