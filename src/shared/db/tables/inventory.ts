// Tabelas do módulo Inventory (Etapa 5 — docs/modules/inventory.md §9).
// Caminhos relativos: o drizzle-kit não entende o atalho "@/".
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  decimal,
  index,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { timestamps, utcDatetime, version } from '../columns';
import { uuidBinary } from '../uuid-binary';
import { company, store } from './organizations';
import { appUser } from './users';

export const BASE_UNITS = ['g', 'ml', 'un'] as const;
export const STOCK_MOVEMENT_TYPES = [
  'ENTRADA',
  'SAIDA',
  'AJUSTE',
  'PERDA',
  'CONSUMO_VENDA',
  'ESTORNO_VENDA',
] as const;
export const LOSS_REASONS = [
  'VENCIDO',
  'ESTRAGADO',
  'ERRO_PREPARO',
  'QUEBRA',
  'OUTRO',
  'CANCELAMENTO_APOS_PREPARO',
] as const;
export const STOCK_ORIGIN_TYPES = ['MANUAL', 'ORDER_ITEM'] as const;

/** Quantidade exata: DECIMAL(14,3) chega como texto ("1500.000"). */
const quantity = (name: string) => decimal(name, { precision: 14, scale: 3 });
/** Custo por unidade base com 6 casas (Q-19). */
const unitCost = (name: string) => decimal(name, { precision: 18, scale: 6 });

/** Insumo da EMPRESA (RN-INV-02). Unidade base imutável; desativado, nunca apagado. */
export const ingredient = mysqlTable(
  'ingredient',
  {
    id: uuidBinary('id').primaryKey(),
    companyId: uuidBinary('company_id')
      .notNull()
      .references(() => company.id),
    name: varchar('name', { length: 80 }).notNull(),
    baseUnit: mysqlEnum('base_unit', BASE_UNITS).notNull(),
    active: boolean('active').notNull().default(true),
    version: version(),
    ...timestamps,
  },
  (table) => [uniqueIndex('uq_ingredient_company_name').on(table.companyId, table.name)],
);

/** Unidade de compra própria do insumo ("caixa" = 12 un) — RN-INV-03. */
export const ingredientUnitConversion = mysqlTable(
  'ingredient_unit_conversion',
  {
    id: uuidBinary('id').primaryKey(),
    ingredientId: uuidBinary('ingredient_id')
      .notNull()
      .references(() => ingredient.id),
    unitName: varchar('unit_name', { length: 20 }).notNull(),
    factorToBase: quantity('factor_to_base').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_ingredient_conversion_name').on(table.ingredientId, table.unitName),
    check('ck_ingredient_conversion_factor', sql`${table.factorToBase} > 0`),
  ],
);

/** Saldo, custo médio e mínimo do insumo NA LOJA. Sem linha = tudo zero (RN-INV-11). */
export const ingredientStock = mysqlTable(
  'ingredient_stock',
  {
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    ingredientId: uuidBinary('ingredient_id')
      .notNull()
      .references(() => ingredient.id),
    quantity: quantity('quantity').notNull().default('0.000'),
    avgUnitCost: unitCost('avg_unit_cost').notNull().default('0.000000'),
    minQuantity: quantity('min_quantity').notNull().default('0.000'),
    version: version(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ name: 'ingredient_stock_pk', columns: [table.storeId, table.ingredientId] }),
    index('ix_ingredient_stock_ingredient').on(table.ingredientId),
    check('ck_ingredient_stock_cost', sql`${table.avgUnitCost} >= 0`),
    check('ck_ingredient_stock_min', sql`${table.minQuantity} >= 0`),
  ],
);

/**
 * Movimentação de estoque — IMUTÁVEL (RN-INV-17: triggers recusam UPDATE e DELETE). Quantidade e
 * valor com sinal: saída negativa, entrada positiva.
 */
export const stockMovement = mysqlTable(
  'stock_movement',
  {
    id: uuidBinary('id').primaryKey(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    ingredientId: uuidBinary('ingredient_id')
      .notNull()
      .references(() => ingredient.id),
    type: mysqlEnum('type', STOCK_MOVEMENT_TYPES).notNull(),
    quantity: quantity('quantity').notNull(),
    unitCost: unitCost('unit_cost').notNull(),
    /** Valor em centavos (entrada = valor pago; demais = quantidade × custo do momento). */
    valueCents: bigint('value_cents', { mode: 'number' }).notNull(),
    balanceAfter: quantity('balance_after').notNull(),
    lossReason: mysqlEnum('loss_reason', LOSS_REASONS),
    note: varchar('note', { length: 200 }),
    /** O que a pessoa digitou ("2 kg", "1 caixa"), para o extrato. */
    enteredText: varchar('entered_text', { length: 40 }),
    originType: mysqlEnum('origin_type', STOCK_ORIGIN_TYPES).notNull(),
    originId: uuidBinary('origin_id'),
    /** Quem fez (usuário nunca é apagado — só desativado). */
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => appUser.id),
    occurredAt: utcDatetime('occurred_at').notNull(),
    operationalDate: date('operational_date', { mode: 'string' }).notNull(),
  },
  (table) => [
    index('ix_stock_movement_ingredient_time').on(
      table.storeId,
      table.ingredientId,
      table.occurredAt,
    ),
    index('ix_stock_movement_day_type').on(table.storeId, table.operationalDate, table.type),
    index('ix_stock_movement_origin').on(table.originType, table.originId),
    index('ix_stock_movement_ingredient').on(table.ingredientId),
    index('ix_stock_movement_user').on(table.userId),
    // Consistência garantida no banco (sugestão S-1 da revisão — migration 0007)
    check('ck_stock_movement_quantity', sql`${table.quantity} <> 0`),
    check(
      'ck_stock_movement_sign',
      sql`(${table.type} IN ('ENTRADA', 'ESTORNO_VENDA') AND ${table.quantity} > 0)
        OR (${table.type} IN ('SAIDA', 'PERDA', 'CONSUMO_VENDA') AND ${table.quantity} < 0)
        OR ${table.type} = 'AJUSTE'`,
    ),
    check(
      'ck_stock_movement_loss_reason',
      sql`(${table.lossReason} IS NULL) = (${table.type} <> 'PERDA')`,
    ),
    check(
      'ck_stock_movement_origin',
      sql`${table.originType} = 'MANUAL' OR ${table.originId} IS NOT NULL`,
    ),
  ],
);
