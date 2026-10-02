// Tabelas dos módulos Tables e Orders (Etapa 6 — docs/modules/tables.md §9, orders.md §9).
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
  primaryKey,
  smallint,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { timestamps, utcDatetime, version } from '../columns';
import { uuidBinary } from '../uuid-binary';
import { modifier, product } from './catalog';
import { kitchenStation, store } from './organizations';
import { appUser } from './users';

export const TABLE_STATUSES = [
  'LIVRE',
  'OCUPADA',
  'AGUARDANDO_CONTA',
  'EM_PAGAMENTO',
  'LIMPEZA',
] as const;
export const ORDER_TYPES = ['MESA', 'BALCAO'] as const;
export const ORDER_STATUSES = ['ABERTO', 'FECHADO', 'CANCELADO'] as const;
export const ORDER_ITEM_STATUSES = [
  'PENDENTE',
  'ENVIADO',
  'EM_PREPARO',
  'PRONTO',
  'ENTREGUE',
  'CANCELADO',
] as const;
export const KITCHEN_TICKET_STATUSES = ['NOVO', 'EM_PREPARO', 'PRONTO', 'CANCELADO'] as const;

/**
 * Numeração por loja e dia operacional (E3-5): a linha é incrementada com trava, então duas
 * aberturas simultâneas nunca recebem o mesmo número (RN-ORD-04).
 */
export const storeSequence = mysqlTable(
  'store_sequence',
  {
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    name: varchar('name', { length: 30 }).notNull(),
    operationalDate: date('operational_date', { mode: 'string' }).notNull(),
    lastValue: int('last_value', { unsigned: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'store_sequence_pk',
      columns: [table.storeId, table.name, table.operationalDate],
    }),
  ],
);

/**
 * Conta (README B.7.3). `order` é palavra reservada no MySQL. `label`: números das mesas
 * ("10 + 11") ou o nome do balcão (Q-04) — fica guardado mesmo depois de a mesa ser liberada.
 */
export const customerOrder = mysqlTable(
  'customer_order',
  {
    id: uuidBinary('id').primaryKey(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    number: int('number', { unsigned: true }).notNull(),
    /** Dia operacional da abertura (ADR-0013): a numeração recomeça a cada dia. */
    openedDate: date('opened_date', { mode: 'string' }).notNull(),
    type: mysqlEnum('type', ORDER_TYPES).notNull(),
    status: mysqlEnum('status', ORDER_STATUSES).notNull().default('ABERTO'),
    /** Até 12 mesas juntadas (MAX_TABLES_PER_ORDER): 12 × 10 + 11 × 3 = 153 caracteres. */
    label: varchar('label', { length: 160 }).notNull(),
    guests: tinyint('guests', { unsigned: true }),
    openedBy: uuidBinary('opened_by')
      .notNull()
      .references(() => appUser.id),
    openedAt: utcDatetime('opened_at').notNull(),
    closedBy: uuidBinary('closed_by').references(() => appUser.id),
    closedAt: utcDatetime('closed_at'),
    cancelReason: varchar('cancel_reason', { length: 200 }),
    /** Conta que recebeu os itens quando as mesas foram juntadas (RN-ORD-18). */
    mergedIntoOrderId: uuidBinary('merged_into_order_id'),
    // ---- Conta no PDV (Etapa 8 — docs/modules/pos.md) ----
    /** Taxa de serviço CONGELADA na abertura (RN-POS-03): mesa = taxa da loja; balcão = 0. */
    serviceFeeBp: int('service_fee_bp', { unsigned: true }).notNull().default(0),
    /** Taxa retirada com autorização (RN-POS-06). */
    serviceFeeWaived: boolean('service_fee_waived').notNull().default(false),
    /** Desconto na conta (RN-POS-05). */
    discountCents: int('discount_cents', { unsigned: true }).notNull().default(0),
    discountReason: varchar('discount_reason', { length: 200 }),
    /** Soma dos pagamentos ativos — mantida pelo PDV na mesma transação (RN-POS-11). */
    paidCents: int('paid_cents', { unsigned: true }).notNull().default(0),
    /** Última pré-conta emitida (RN-POS-04). */
    prebillAt: utcDatetime('prebill_at'),
    /** Valores congelados no fechamento (RN-POS-12): base dos relatórios da Etapa 9. */
    itemsCents: int('items_cents', { unsigned: true }),
    discountsCents: int('discounts_cents', { unsigned: true }),
    serviceFeeCents: int('service_fee_cents', { unsigned: true }),
    totalCents: int('total_cents', { unsigned: true }),
    version: version(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_customer_order_day_number').on(table.storeId, table.openedDate, table.number),
    index('ix_customer_order_store_status').on(table.storeId, table.status),
    index('ix_customer_order_opened_by').on(table.openedBy),
    index('ix_customer_order_closed_by').on(table.closedBy),
    check(
      'ck_customer_order_guests',
      sql`${table.guests} IS NULL OR ${table.guests} BETWEEN 1 AND 99`,
    ),
    check(
      'ck_customer_order_merged',
      sql`${table.mergedIntoOrderId} IS NULL OR ${table.status} = 'CANCELADO'`,
    ),
    check('ck_customer_order_service_fee', sql`${table.serviceFeeBp} <= 10000`),
    check(
      'ck_customer_order_discount',
      sql`(${table.discountCents} = 0) = (${table.discountReason} IS NULL)`,
    ),
    // Conta fechada tem os valores congelados e foi paga por inteiro
    check(
      'ck_customer_order_closed_totals',
      sql`${table.status} <> 'FECHADO' OR (${table.totalCents} IS NOT NULL AND ${table.paidCents} = ${table.totalCents})`,
    ),
  ],
);

/** Mesa da loja (RN-TAB-02). Uma conta aberta no máximo; mesas juntadas apontam para a mesma. */
export const diningTable = mysqlTable(
  'dining_table',
  {
    id: uuidBinary('id').primaryKey(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    number: varchar('number', { length: 10 }).notNull(),
    area: varchar('area', { length: 40 }),
    seats: tinyint('seats', { unsigned: true }).notNull().default(4),
    status: mysqlEnum('status', TABLE_STATUSES).notNull().default('LIVRE'),
    currentOrderId: uuidBinary('current_order_id').references(() => customerOrder.id),
    active: boolean('active').notNull().default(true),
    version: version(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_dining_table_store_number').on(table.storeId, table.number),
    index('ix_dining_table_store_status').on(table.storeId, table.status),
    index('ix_dining_table_current_order').on(table.currentOrderId),
    check('ck_dining_table_seats', sql`${table.seats} BETWEEN 1 AND 99`),
    // Conta só em mesa em uso (RN-TAB-06)
    check(
      'ck_dining_table_order',
      sql`(${table.currentOrderId} IS NULL) = (${table.status} IN ('LIVRE', 'LIMPEZA'))`,
    ),
  ],
);

/** Rodada: um envio para a cozinha (RN-ORD-10). */
export const orderRound = mysqlTable(
  'order_round',
  {
    id: uuidBinary('id').primaryKey(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    orderId: uuidBinary('order_id')
      .notNull()
      .references(() => customerOrder.id),
    number: smallint('number', { unsigned: true }).notNull(),
    sentBy: uuidBinary('sent_by')
      .notNull()
      .references(() => appUser.id),
    sentAt: utcDatetime('sent_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_order_round_number').on(table.orderId, table.number),
    index('ix_order_round_store').on(table.storeId),
    index('ix_order_round_sent_by').on(table.sentBy),
  ],
);

/**
 * Via da cozinha de uma rodada numa estação. A situação é CALCULADA dos itens (RN-KDS-06);
 * `finished_at` = quando saiu da fila (pronto ou cancelado) — base dos "prontos há pouco".
 */
export const kitchenTicket = mysqlTable(
  'kitchen_ticket',
  {
    id: uuidBinary('id').primaryKey(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    orderId: uuidBinary('order_id')
      .notNull()
      .references(() => customerOrder.id),
    roundId: uuidBinary('round_id')
      .notNull()
      .references(() => orderRound.id),
    stationId: uuidBinary('station_id')
      .notNull()
      .references(() => kitchenStation.id),
    status: mysqlEnum('status', KITCHEN_TICKET_STATUSES).notNull().default('NOVO'),
    createdAt: utcDatetime('created_at').notNull(),
    startedAt: utcDatetime('started_at'),
    readyAt: utcDatetime('ready_at'),
    finishedAt: utcDatetime('finished_at'),
    version: version(),
    updatedAt: timestamps.updatedAt,
  },
  (table) => [
    uniqueIndex('uq_kitchen_ticket_round_station').on(table.roundId, table.stationId),
    index('ix_kitchen_ticket_queue').on(
      table.storeId,
      table.stationId,
      table.status,
      table.createdAt,
    ),
    // Prontos há pouco / cancelados agora (RN-KDS-08, RN-KDS-10)
    index('ix_kitchen_ticket_finished').on(table.storeId, table.stationId, table.finishedAt),
    index('ix_kitchen_ticket_order').on(table.orderId),
    index('ix_kitchen_ticket_station').on(table.stationId),
  ],
);

/**
 * Item da conta. Nome e preços CONGELADOS no lançamento (RN-ORD-07). Quantidade inteira (E6-3).
 * Valores em centavos (ADR-0003): total = (unit_price + modifiers) × quantity.
 */
export const orderItem = mysqlTable(
  'order_item',
  {
    id: uuidBinary('id').primaryKey(),
    storeId: uuidBinary('store_id')
      .notNull()
      .references(() => store.id),
    orderId: uuidBinary('order_id')
      .notNull()
      .references(() => customerOrder.id),
    roundId: uuidBinary('round_id').references(() => orderRound.id),
    productId: uuidBinary('product_id')
      .notNull()
      .references(() => product.id),
    productName: varchar('product_name', { length: 80 }).notNull(),
    unitPriceCents: int('unit_price_cents', { unsigned: true }).notNull(),
    /** Soma dos adicionais por unidade. */
    modifiersCents: int('modifiers_cents', { unsigned: true }).notNull().default(0),
    quantity: tinyint('quantity', { unsigned: true }).notNull(),
    notes: varchar('notes', { length: 140 }),
    requiresPreparation: boolean('requires_preparation').notNull(),
    status: mysqlEnum('status', ORDER_ITEM_STATUSES).notNull().default('PENDENTE'),
    stationId: uuidBinary('station_id').references(() => kitchenStation.id),
    kitchenTicketId: uuidBinary('kitchen_ticket_id').references(() => kitchenTicket.id),
    createdBy: uuidBinary('created_by')
      .notNull()
      .references(() => appUser.id),
    createdAt: utcDatetime('created_at').notNull(),
    sentAt: utcDatetime('sent_at'),
    startedAt: utcDatetime('started_at'),
    /** Quem iniciou e quem terminou na cozinha (Etapa 7). */
    startedBy: uuidBinary('started_by').references(() => appUser.id),
    readyAt: utcDatetime('ready_at'),
    readyBy: uuidBinary('ready_by').references(() => appUser.id),
    deliveredAt: utcDatetime('delivered_at'),
    deliveredBy: uuidBinary('delivered_by').references(() => appUser.id),
    cancelledAt: utcDatetime('cancelled_at'),
    cancelledBy: uuidBinary('cancelled_by').references(() => appUser.id),
    cancelAuthorizedBy: uuidBinary('cancel_authorized_by').references(() => appUser.id),
    cancelReason: varchar('cancel_reason', { length: 200 }),
    /** A baixa de estoque foi feita no envio (ADR-0006). */
    stockConsumed: boolean('stock_consumed').notNull().default(false),
    /** Desconto na linha (RN-POS-05). */
    discountCents: int('discount_cents', { unsigned: true }).notNull().default(0),
    discountReason: varchar('discount_reason', { length: 200 }),
    updatedAt: timestamps.updatedAt,
  },
  (table) => [
    index('ix_order_item_order_status').on(table.orderId, table.status),
    index('ix_order_item_store_status_sent').on(table.storeId, table.status, table.sentAt),
    index('ix_order_item_ticket').on(table.kitchenTicketId),
    index('ix_order_item_round').on(table.roundId),
    index('ix_order_item_product').on(table.productId),
    index('ix_order_item_station').on(table.stationId),
    index('ix_order_item_created_by').on(table.createdBy),
    index('ix_order_item_started_by').on(table.startedBy),
    index('ix_order_item_ready_by').on(table.readyBy),
    index('ix_order_item_delivered_by').on(table.deliveredBy),
    index('ix_order_item_cancelled_by').on(table.cancelledBy),
    index('ix_order_item_cancel_authorized_by').on(table.cancelAuthorizedBy),
    check('ck_order_item_quantity', sql`${table.quantity} BETWEEN 1 AND 99`),
    // Enviado ⇔ tem rodada (pendente nunca foi à cozinha; cancelado só depois de enviado)
    check('ck_order_item_round', sql`(${table.roundId} IS NULL) = (${table.status} = 'PENDENTE')`),
    check(
      'ck_order_item_cancel',
      sql`(${table.status} = 'CANCELADO') = (${table.cancelReason} IS NOT NULL)`,
    ),
    check(
      'ck_order_item_discount',
      sql`${table.discountCents} <= (${table.unitPriceCents} + ${table.modifiersCents}) * ${table.quantity} AND (${table.discountCents} = 0) = (${table.discountReason} IS NULL)`,
    ),
  ],
);

/** Adicional escolhido, congelado no lançamento (RN-ORD-06, RN-ORD-07). */
export const orderItemModifier = mysqlTable(
  'order_item_modifier',
  {
    id: uuidBinary('id').primaryKey(),
    orderItemId: uuidBinary('order_item_id')
      .notNull()
      .references(() => orderItem.id, { onDelete: 'cascade' }),
    modifierId: uuidBinary('modifier_id')
      .notNull()
      .references(() => modifier.id),
    name: varchar('name', { length: 60 }).notNull(),
    priceDeltaCents: int('price_delta_cents', { unsigned: true }).notNull(),
  },
  (table) => [
    uniqueIndex('uq_order_item_modifier').on(table.orderItemId, table.modifierId),
    index('ix_order_item_modifier_modifier').on(table.modifierId),
  ],
);
