// Tabelas dos módulos Cashier (caixa) e POS (pagamentos) — Etapa 8 (docs/modules/cashier.md §9,
// pos.md §9). Num arquivo só porque se referenciam: a movimentação aponta para o pagamento e o
// pagamento aponta para o caixa. Caminhos relativos: o drizzle-kit não entende o atalho "@/".
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { utcDatetime, version } from '../columns';
import { uuidBinary } from '../uuid-binary';
import { customerOrder, orderItem } from './orders';
import { store } from './organizations';
import { terminal } from './terminals';
import { appUser } from './users';

export const CASH_SESSION_STATUSES = ['ABERTA', 'FECHADA'] as const;
export const CASH_MOVEMENT_TYPES = ['VENDA', 'SANGRIA', 'SUPRIMENTO', 'AJUSTE', 'ESTORNO'] as const;
export const PAYMENT_METHODS = [
  'DINHEIRO',
  'PIX',
  'CARTAO_CREDITO',
  'CARTAO_DEBITO',
  'OUTRO',
] as const;
export const PAYMENT_STATUSES = ['ATIVO', 'CANCELADO'] as const;

/** Fundo de troco máximo: R$ 100.000,00. */
const MAX_OPENING_CENTS = 10_000_000;

/** Sessão de caixa por terminal (RN-CASH-02). */
export const cashSession = mysqlTable(
  'cash_session',
  {
    id: uuidBinary('id').primaryKey(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    terminalId: uuidBinary('terminal_id')
      .notNull()
      .references(() => terminal.id),
    status: mysqlEnum('status', CASH_SESSION_STATUSES).notNull().default('ABERTA'),
    /** Dia operacional da abertura (ADR-0013). */
    operationalDate: date('operational_date', { mode: 'string' }).notNull(),
    openedBy: uuidBinary('opened_by')
      .notNull()
      .references(() => appUser.id),
    openedAt: utcDatetime('opened_at').notNull(),
    openingAmountCents: int('opening_amount_cents', { unsigned: true }).notNull(),
    closedBy: uuidBinary('closed_by').references(() => appUser.id),
    closedAt: utcDatetime('closed_at'),
    version: version(),
    /** Coluna calculada: o terminal, só enquanto ABERTA — o índice único garante UM caixa aberto. */
    openTerminalId: uuidBinary('open_terminal_id').generatedAlwaysAs(
      sql`(if(\`status\` = 'ABERTA', \`terminal_id\`, NULL))`,
      { mode: 'stored' },
    ),
  },
  (table) => [
    uniqueIndex('uq_cash_session_open_terminal').on(table.openTerminalId),
    index('ix_cash_session_store_status').on(table.storeId, table.status),
    index('ix_cash_session_store_date').on(table.storeId, table.operationalDate),
    index('ix_cash_session_terminal').on(table.terminalId),
    index('ix_cash_session_opened_by').on(table.openedBy),
    index('ix_cash_session_closed_by').on(table.closedBy),
    check(
      'ck_cash_session_opening',
      sql`${table.openingAmountCents} <= ${sql.raw(String(MAX_OPENING_CENTS))}`,
    ),
    check(
      'ck_cash_session_closed',
      sql`(${table.status} = 'FECHADA') = (${table.closedAt} IS NOT NULL)`,
    ),
  ],
);

/** Pagamento de uma conta (RN-POS-08). O valor é o que ABATE da conta (troco à parte). */
export const payment = mysqlTable(
  'payment',
  {
    id: uuidBinary('id').primaryKey(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    orderId: uuidBinary('order_id')
      .notNull()
      .references(() => customerOrder.id),
    cashSessionId: uuidBinary('cash_session_id')
      .notNull()
      .references(() => cashSession.id),
    method: mysqlEnum('method', PAYMENT_METHODS).notNull(),
    amountCents: int('amount_cents', { unsigned: true }).notNull(),
    /** Dinheiro: quanto o cliente entregou e o troco (RN-POS-09). */
    tenderedCents: int('tendered_cents', { unsigned: true }),
    changeCents: int('change_cents', { unsigned: true }),
    /** NSU, código do PIX… (confirmação manual — PaymentProvider). */
    reference: varchar('reference', { length: 60 }),
    status: mysqlEnum('status', PAYMENT_STATUSES).notNull().default('ATIVO'),
    createdBy: uuidBinary('created_by')
      .notNull()
      .references(() => appUser.id),
    createdAt: utcDatetime('created_at').notNull(),
    cancelledBy: uuidBinary('cancelled_by').references(() => appUser.id),
    cancelledAt: utcDatetime('cancelled_at'),
    cancelAuthorizedBy: uuidBinary('cancel_authorized_by').references(() => appUser.id),
    cancelReason: varchar('cancel_reason', { length: 200 }),
    version: version(),
  },
  (table) => [
    index('ix_payment_order_status').on(table.orderId, table.status),
    index('ix_payment_store_created').on(table.storeId, table.createdAt),
    index('ix_payment_cash_session').on(table.cashSessionId),
    index('ix_payment_created_by').on(table.createdBy),
    index('ix_payment_cancelled_by').on(table.cancelledBy),
    index('ix_payment_cancel_authorized_by').on(table.cancelAuthorizedBy),
    check('ck_payment_amount', sql`${table.amountCents} > 0`),
    // Troco só no dinheiro; recebido = valor + troco
    check(
      'ck_payment_change',
      sql`(${table.method} = 'DINHEIRO' AND ${table.tenderedCents} = ${table.amountCents} + ${table.changeCents}) OR (${table.method} <> 'DINHEIRO' AND ${table.tenderedCents} IS NULL AND ${table.changeCents} IS NULL)`,
    ),
    check(
      'ck_payment_cancel',
      sql`(${table.status} = 'CANCELADO') = (${table.cancelReason} IS NOT NULL)`,
    ),
  ],
);

/** Divisão por itens (RN-POS-13): a parte de cada item num pagamento. */
export const paymentAllocation = mysqlTable(
  'payment_allocation',
  {
    paymentId: uuidBinary('payment_id')
      .notNull()
      .references(() => payment.id),
    orderItemId: uuidBinary('order_item_id')
      .notNull()
      .references(() => orderItem.id),
    amountCents: int('amount_cents', { unsigned: true }).notNull(),
  },
  (table) => [
    primaryKey({ name: 'payment_allocation_pk', columns: [table.paymentId, table.orderItemId] }),
    index('ix_payment_allocation_item').on(table.orderItemId),
  ],
);

/** Movimentação do caixa, imutável (RN-CASH-03 a 05). Valor com sinal: saída é negativa. */
export const cashMovement = mysqlTable(
  'cash_movement',
  {
    id: uuidBinary('id').primaryKey(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    cashSessionId: uuidBinary('cash_session_id')
      .notNull()
      .references(() => cashSession.id),
    type: mysqlEnum('type', CASH_MOVEMENT_TYPES).notNull(),
    paymentMethod: mysqlEnum('payment_method', PAYMENT_METHODS).notNull(),
    amountCents: int('amount_cents').notNull(),
    paymentId: uuidBinary('payment_id').references(() => payment.id),
    reason: varchar('reason', { length: 200 }),
    userId: uuidBinary('user_id')
      .notNull()
      .references(() => appUser.id),
    authorizedBy: uuidBinary('authorized_by').references(() => appUser.id),
    occurredAt: utcDatetime('occurred_at').notNull(),
  },
  (table) => [
    index('ix_cash_movement_session_type').on(table.cashSessionId, table.type),
    uniqueIndex('uq_cash_movement_payment_type').on(table.paymentId, table.type),
    index('ix_cash_movement_store').on(table.storeId),
    index('ix_cash_movement_user').on(table.userId),
    index('ix_cash_movement_authorized_by').on(table.authorizedBy),
    check('ck_cash_movement_amount', sql`${table.amountCents} <> 0`),
    // Sangria e suprimento: dinheiro, com motivo; venda e estorno: ligados a um pagamento
    check(
      'ck_cash_movement_kind',
      sql`(${table.type} IN ('SANGRIA', 'SUPRIMENTO', 'AJUSTE') AND ${table.paymentId} IS NULL AND ${table.reason} IS NOT NULL AND ${table.paymentMethod} = 'DINHEIRO') OR (${table.type} IN ('VENDA', 'ESTORNO') AND ${table.paymentId} IS NOT NULL)`,
    ),
  ],
);

/** Fechamento cego por forma de pagamento (RN-CASH-06). */
export const cashSessionCount = mysqlTable(
  'cash_session_count',
  {
    cashSessionId: uuidBinary('cash_session_id')
      .notNull()
      .references(() => cashSession.id),
    paymentMethod: mysqlEnum('payment_method', PAYMENT_METHODS).notNull(),
    expectedCents: int('expected_cents').notNull(),
    /** Informado pelo operador; null = não conferiu esta forma (Q-16). */
    declaredCents: int('declared_cents'),
    differenceCents: int('difference_cents'),
  },
  (table) => [
    primaryKey({
      name: 'cash_session_count_pk',
      columns: [table.cashSessionId, table.paymentMethod],
    }),
    check(
      'ck_cash_session_count_difference',
      sql`(${table.declaredCents} IS NULL AND ${table.differenceCents} IS NULL) OR ${table.differenceCents} = ${table.declaredCents} - ${table.expectedCents}`,
    ),
  ],
);
