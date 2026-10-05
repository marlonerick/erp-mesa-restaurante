// Tabelas do módulo Finance (Etapa 9 — docs/modules/finance.md §9).
// Caminhos relativos: o drizzle-kit não entende o atalho "@/".
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { timestamps, utcDatetime, version } from '../columns';
import { uuidBinary } from '../uuid-binary';
import { cashSession, PAYMENT_METHODS } from './cashier';
import { company, store } from './organizations';
import { appUser } from './users';

export const FINANCE_TYPES = ['RECEITA', 'DESPESA'] as const;
export const FINANCE_STATUSES = ['PREVISTO', 'PAGO', 'CANCELADO'] as const;
export const FINANCE_SOURCES = ['MANUAL', 'CAIXA'] as const;

/** Categoria de receita/despesa da EMPRESA (RN-FIN-02). `system_code` = categoria do sistema. */
export const financeCategory = mysqlTable(
  'finance_category',
  {
    id: uuidBinary('id').primaryKey(),
    companyId: uuidBinary('company_id')
      .notNull()
      .references(() => company.id),
    type: mysqlEnum('type', FINANCE_TYPES).notNull(),
    name: varchar('name', { length: 60 }).notNull(),
    /** "VENDAS" na categoria das receitas automáticas; null nas demais. */
    systemCode: varchar('system_code', { length: 20 }),
    active: boolean('active').notNull().default(true),
    version: version(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_finance_category_name').on(table.companyId, table.type, table.name),
    uniqueIndex('uq_finance_category_system').on(table.companyId, table.systemCode),
  ],
);

/** Lançamento financeiro da LOJA (RN-FIN-03 a RN-FIN-06). Valor sempre positivo; o tipo dá o sinal. */
export const financeEntry = mysqlTable(
  'finance_entry',
  {
    id: uuidBinary('id').primaryKey(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    type: mysqlEnum('type', FINANCE_TYPES).notNull(),
    categoryId: uuidBinary('category_id')
      .notNull()
      .references(() => financeCategory.id),
    description: varchar('description', { length: 120 }).notNull(),
    amountCents: int('amount_cents', { unsigned: true }).notNull(),
    /** Dia (local) a que o lançamento se refere. */
    competenceDate: date('competence_date', { mode: 'string' }).notNull(),
    /** Vencimento (PREVISTO). */
    dueDate: date('due_date', { mode: 'string' }),
    /** Dia (local) do pagamento/recebimento (PAGO). */
    paidDate: date('paid_date', { mode: 'string' }),
    status: mysqlEnum('status', FINANCE_STATUSES).notNull(),
    source: mysqlEnum('source', FINANCE_SOURCES).notNull(),
    /** Origem CAIXA: o caixa e a forma de pagamento (uma receita por caixa e forma). */
    cashSessionId: uuidBinary('cash_session_id').references(() => cashSession.id),
    paymentMethod: mysqlEnum('payment_method', PAYMENT_METHODS),
    createdBy: uuidBinary('created_by')
      .notNull()
      .references(() => appUser.id),
    createdAt: utcDatetime('created_at').notNull(),
    cancelledBy: uuidBinary('cancelled_by').references(() => appUser.id),
    cancelledAt: utcDatetime('cancelled_at'),
    cancelReason: varchar('cancel_reason', { length: 200 }),
    version: version(),
    updatedAt: timestamps.updatedAt,
  },
  (table) => [
    index('ix_finance_entry_competence').on(table.storeId, table.competenceDate),
    index('ix_finance_entry_due').on(table.storeId, table.status, table.dueDate),
    index('ix_finance_entry_paid').on(table.storeId, table.paidDate),
    uniqueIndex('uq_finance_entry_cash_method').on(table.cashSessionId, table.paymentMethod),
    index('ix_finance_entry_category').on(table.categoryId),
    index('ix_finance_entry_created_by').on(table.createdBy),
    index('ix_finance_entry_cancelled_by').on(table.cancelledBy),
    check('ck_finance_entry_amount', sql`${table.amountCents} > 0`),
    check(
      'ck_finance_entry_status',
      sql`(${table.status} = 'PAGO' AND ${table.paidDate} IS NOT NULL) OR (${table.status} = 'PREVISTO' AND ${table.dueDate} IS NOT NULL AND ${table.paidDate} IS NULL) OR ${table.status} = 'CANCELADO'`,
    ),
    check(
      'ck_finance_entry_cancel',
      sql`(${table.status} = 'CANCELADO') = (${table.cancelReason} IS NOT NULL)`,
    ),
    check(
      'ck_finance_entry_source',
      sql`(${table.source} = 'CAIXA') = (${table.cashSessionId} IS NOT NULL AND ${table.paymentMethod} IS NOT NULL)`,
    ),
  ],
);
