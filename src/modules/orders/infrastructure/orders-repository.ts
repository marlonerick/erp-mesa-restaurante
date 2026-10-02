import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  customerOrder,
  kitchenTicket,
  orderItem,
  orderItemModifier,
  orderRound,
  storeSequence,
} from '@/shared/db/schema';
import { type Id, newId } from '@/shared/kernel';
import { deriveTicketStatus } from '../domain/rules';
import type { ItemRecord, LockOption, OrdersRepository } from '../application/ports';

const ORDER_SEQUENCE = 'customer_order';

const orderColumns = {
  id: customerOrder.id,
  storeId: customerOrder.storeId,
  number: customerOrder.number,
  openedDate: customerOrder.openedDate,
  type: customerOrder.type,
  status: customerOrder.status,
  label: customerOrder.label,
  guests: customerOrder.guests,
  openedBy: customerOrder.openedBy,
  openedAt: customerOrder.openedAt,
  version: customerOrder.version,
  serviceFeeBp: customerOrder.serviceFeeBp,
  serviceFeeWaived: customerOrder.serviceFeeWaived,
  discountCents: customerOrder.discountCents,
  discountReason: customerOrder.discountReason,
  paidCents: customerOrder.paidCents,
  prebillAt: customerOrder.prebillAt,
};

const itemColumns = {
  id: orderItem.id,
  orderId: orderItem.orderId,
  roundId: orderItem.roundId,
  productId: orderItem.productId,
  productName: orderItem.productName,
  unitPriceCents: orderItem.unitPriceCents,
  modifiersCents: orderItem.modifiersCents,
  quantity: orderItem.quantity,
  notes: orderItem.notes,
  requiresPreparation: orderItem.requiresPreparation,
  status: orderItem.status,
  kitchenTicketId: orderItem.kitchenTicketId,
  stockConsumed: orderItem.stockConsumed,
  createdBy: orderItem.createdBy,
  createdAt: orderItem.createdAt,
  sentAt: orderItem.sentAt,
  readyAt: orderItem.readyAt,
  deliveredAt: orderItem.deliveredAt,
  cancelledAt: orderItem.cancelledAt,
  cancelReason: orderItem.cancelReason,
  discountCents: orderItem.discountCents,
  discountReason: orderItem.discountReason,
};

const kitchenItemColumns = {
  id: orderItem.id,
  orderId: orderItem.orderId,
  kitchenTicketId: orderItem.kitchenTicketId,
  status: orderItem.status,
  requiresPreparation: orderItem.requiresPreparation,
  productName: orderItem.productName,
  quantity: orderItem.quantity,
  notes: orderItem.notes,
  startedAt: orderItem.startedAt,
  startedBy: orderItem.startedBy,
  readyAt: orderItem.readyAt,
  readyBy: orderItem.readyBy,
  cancelledAt: orderItem.cancelledAt,
  cancelReason: orderItem.cancelReason,
};

const ticketColumns = {
  id: kitchenTicket.id,
  stationId: kitchenTicket.stationId,
  status: kitchenTicket.status,
  orderId: kitchenTicket.orderId,
  orderNumber: customerOrder.number,
  orderType: customerOrder.type,
  orderLabel: customerOrder.label,
  roundNumber: orderRound.number,
  sentBy: orderRound.sentBy,
  createdAt: kitchenTicket.createdAt,
  startedAt: kitchenTicket.startedAt,
  readyAt: kitchenTicket.readyAt,
  finishedAt: kitchenTicket.finishedAt,
};

type Tx = Parameters<OrdersRepository['listItems']>[0];

/** Ticket com a conta e a rodada (a conta e a rodada são sempre da mesma loja). */
const selectTickets = (tx: Tx) =>
  tx
    .select(ticketColumns)
    .from(kitchenTicket)
    .innerJoin(customerOrder, eq(customerOrder.id, kitchenTicket.orderId))
    .innerJoin(orderRound, eq(orderRound.id, kitchenTicket.roundId));

/** Junta os adicionais (congelados) aos itens. */
async function withModifiers<R extends { id: Id }>(
  tx: Tx,
  rows: readonly R[],
  options: LockOption = {},
): Promise<(R & { modifiers: ItemRecord['modifiers'] })[]> {
  if (rows.length === 0) return [];
  const query = tx
    .select({
      orderItemId: orderItemModifier.orderItemId,
      modifierId: orderItemModifier.modifierId,
      name: orderItemModifier.name,
      priceDeltaCents: orderItemModifier.priceDeltaCents,
    })
    .from(orderItemModifier)
    .where(
      inArray(
        orderItemModifier.orderItemId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(orderItemModifier.id));
  // Item lançado por outra transação depois da "foto": os adicionais dele também precisam aparecer
  const extras = options.forUpdate ? await query.for('share') : await query;
  return rows.map((row) => ({
    ...row,
    modifiers: extras
      .filter((extra) => extra.orderItemId === row.id)
      .map(({ modifierId, name, priceDeltaCents }) => ({ modifierId, name, priceDeltaCents })),
  }));
}

export const ordersRepository: OrdersRepository = {
  async nextOrderNumber(tx, storeId, day) {
    // A linha do dia é criada ou incrementada — e fica travada até o fim da transação
    await tx
      .insert(storeSequence)
      .values({ storeId, name: ORDER_SEQUENCE, operationalDate: day, lastValue: 1 })
      .onDuplicateKeyUpdate({ set: { lastValue: sql`${storeSequence.lastValue} + 1` } });
    const [row] = await tx
      .select({ value: storeSequence.lastValue })
      .from(storeSequence)
      .where(
        and(
          eq(storeSequence.storeId, storeId),
          eq(storeSequence.name, ORDER_SEQUENCE),
          eq(storeSequence.operationalDate, day),
        ),
      );
    if (!row) throw new Error('sequência da conta não encontrada');
    return row.value;
  },

  async insertOrder(tx, input) {
    await tx.insert(customerOrder).values({ ...input, status: 'ABERTO' });
  },

  async findOrder(tx, { storeId, orderId }, options = {}) {
    const query = tx
      .select(orderColumns)
      .from(customerOrder)
      .where(and(eq(customerOrder.id, orderId), eq(customerOrder.storeId, storeId)));
    const [row] = options.forUpdate ? await query.for('update') : await query;
    return row ?? null;
  },

  async lockOrders(tx, storeId, orderIds) {
    const ids = [...new Set(orderIds)];
    if (ids.length === 0) return [];
    return tx
      .select(orderColumns)
      .from(customerOrder)
      .where(and(eq(customerOrder.storeId, storeId), inArray(customerOrder.id, ids)))
      .orderBy(asc(customerOrder.id))
      .for('update');
  },

  async bumpOrder(tx, orderId, changes = {}) {
    await tx
      .update(customerOrder)
      .set({
        ...(changes.label === undefined ? {} : { label: changes.label }),
        version: sql`${customerOrder.version} + 1`,
      })
      .where(eq(customerOrder.id, orderId));
  },

  async closeOrderAsCancelled(tx, orderId, data) {
    await tx
      .update(customerOrder)
      .set({
        status: 'CANCELADO',
        cancelReason: data.reason,
        mergedIntoOrderId: data.mergedInto,
        closedBy: data.by,
        closedAt: data.at,
        version: sql`${customerOrder.version} + 1`,
      })
      .where(eq(customerOrder.id, orderId));
  },

  async listOpenOrders(tx, storeId) {
    const rows = await tx
      .select({
        ...orderColumns,
        subtotal: sql<string>`coalesce(sum(case when ${orderItem.status} <> 'CANCELADO' then (${orderItem.unitPriceCents} + ${orderItem.modifiersCents}) * ${orderItem.quantity} else 0 end), 0)`,
        pending: sql<string>`coalesce(sum(${orderItem.status} = 'PENDENTE'), 0)`,
        ready: sql<string>`coalesce(sum(${orderItem.status} = 'PRONTO'), 0)`,
        itemDiscounts: sql<string>`coalesce(sum(case when ${orderItem.status} <> 'CANCELADO' then ${orderItem.discountCents} else 0 end), 0)`,
      })
      .from(customerOrder)
      .leftJoin(orderItem, eq(orderItem.orderId, customerOrder.id))
      .where(and(eq(customerOrder.storeId, storeId), eq(customerOrder.status, 'ABERTO')))
      .groupBy(customerOrder.id)
      .orderBy(asc(customerOrder.openedAt));
    // SUM chega como texto (DECIMAL): inteiros exatos em centavos
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      type: row.type,
      label: row.label,
      openedAt: row.openedAt,
      version: row.version,
      subtotalCents: Number(row.subtotal),
      pendingCount: Number(row.pending),
      readyCount: Number(row.ready),
      itemDiscountsCents: Number(row.itemDiscounts),
      discountCents: row.discountCents,
      serviceFeeBp: row.serviceFeeBp,
      serviceFeeWaived: row.serviceFeeWaived,
      paidCents: row.paidCents,
      prebillAt: row.prebillAt,
    }));
  },

  async listItems(tx, orderId, options = {}) {
    const query = tx
      .select(itemColumns)
      .from(orderItem)
      .where(eq(orderItem.orderId, orderId))
      // UUIDv7: ordem de lançamento
      .orderBy(asc(orderItem.id));
    const rows = options.forUpdate ? await query.for('update') : await query;
    return withModifiers(tx, rows, options);
  },

  async countItems(tx, orderId, options = {}) {
    const query = tx
      // COUNT é BIGINT: chega como texto (ADR-0003)
      .select({ total: sql<string>`count(*)` })
      .from(orderItem)
      .where(eq(orderItem.orderId, orderId));
    const [row] = options.forUpdate ? await query.for('share') : await query;
    return Number(row?.total ?? 0);
  },

  async findItem(tx, { storeId, itemId }, options = {}) {
    const query = tx
      .select(itemColumns)
      .from(orderItem)
      .where(and(eq(orderItem.id, itemId), eq(orderItem.storeId, storeId)));
    const rows = options.forUpdate ? await query.for('update') : await query;
    const [item] = await withModifiers(tx, rows, options);
    return item ?? null;
  },

  async insertItem(tx, { modifiers, ...item }) {
    await tx.insert(orderItem).values({ ...item, status: 'PENDENTE' });
    if (modifiers.length > 0) {
      await tx.insert(orderItemModifier).values(
        modifiers.map((extra) => ({
          id: newId(),
          orderItemId: item.id,
          modifierId: extra.modifierId,
          name: extra.name,
          priceDeltaCents: extra.priceDeltaCents,
        })),
      );
    }
  },

  async deleteItems(tx, itemIds) {
    if (itemIds.length === 0) return;
    // Os adicionais vão junto (ON DELETE CASCADE)
    await tx.delete(orderItem).where(inArray(orderItem.id, [...itemIds]));
  },

  async markSent(tx, itemIds, data) {
    if (itemIds.length === 0) return;
    await tx
      .update(orderItem)
      .set({
        roundId: data.roundId,
        status: data.status,
        stationId: data.stationId,
        kitchenTicketId: data.ticketId,
        sentAt: data.at,
        readyAt: data.status === 'PRONTO' ? data.at : null,
        stockConsumed: true,
      })
      .where(and(inArray(orderItem.id, [...itemIds]), eq(orderItem.status, 'PENDENTE')));
  },

  async markDelivered(tx, itemId, data) {
    await tx
      .update(orderItem)
      .set({ status: 'ENTREGUE', deliveredAt: data.at, deliveredBy: data.by })
      .where(eq(orderItem.id, itemId));
  },

  async markCancelled(tx, itemId, data) {
    await tx
      .update(orderItem)
      .set({
        status: 'CANCELADO',
        cancelledAt: data.at,
        cancelledBy: data.by,
        cancelAuthorizedBy: data.authorizedBy,
        cancelReason: data.reason,
      })
      .where(eq(orderItem.id, itemId));
  },

  async moveItems(tx, fromOrderId, toOrderId) {
    await tx
      .update(orderItem)
      .set({ orderId: toOrderId })
      .where(eq(orderItem.orderId, fromOrderId));
  },

  async listRounds(tx, orderId, options = {}) {
    const query = tx
      .select({
        id: orderRound.id,
        orderId: orderRound.orderId,
        number: orderRound.number,
        sentBy: orderRound.sentBy,
        sentAt: orderRound.sentAt,
      })
      .from(orderRound)
      .where(eq(orderRound.orderId, orderId))
      .orderBy(asc(orderRound.number));
    return options.forUpdate ? query.for('update') : query;
  },

  async insertRound(tx, round) {
    await tx.insert(orderRound).values(round);
  },

  async moveRounds(tx, toOrderId, renumber) {
    for (const { roundId, number } of renumber) {
      await tx
        .update(orderRound)
        .set({ orderId: toOrderId, number })
        .where(eq(orderRound.id, roundId));
    }
  },

  async insertTicket(tx, ticket) {
    await tx.insert(kitchenTicket).values({ ...ticket, status: 'NOVO' });
  },

  async refreshTicket(tx, { storeId, ticketId }, at) {
    // Leituras COM TRAVA: outra ação no mesmo ticket pode ter acabado de confirmar (RN-ORD-21)
    const [ticket] = await tx
      .select({
        status: kitchenTicket.status,
        startedAt: kitchenTicket.startedAt,
        readyAt: kitchenTicket.readyAt,
        finishedAt: kitchenTicket.finishedAt,
      })
      .from(kitchenTicket)
      .where(and(eq(kitchenTicket.id, ticketId), eq(kitchenTicket.storeId, storeId)))
      .for('update');
    if (!ticket) return;
    const items = await tx
      .select({ status: orderItem.status })
      .from(orderItem)
      .where(and(eq(orderItem.kitchenTicketId, ticketId), eq(orderItem.storeId, storeId)))
      .for('share');
    const status = deriveTicketStatus(items.map((item) => item.status));
    if (status === ticket.status) return;
    const finished = status === 'PRONTO' || status === 'CANCELADO';
    await tx
      .update(kitchenTicket)
      .set({
        status,
        // Começou quando o primeiro item foi iniciado ou ficou pronto
        startedAt: ticket.startedAt ?? (status === 'EM_PREPARO' || status === 'PRONTO' ? at : null),
        readyAt: status === 'PRONTO' ? at : null,
        // Pedido que JÁ tinha saído da fila (pronto) e depois teve tudo cancelado não "volta" como
        // cancelado agora: guarda a saída original (sugestão S-2 da revisão)
        finishedAt: finished ? (ticket.status === 'PRONTO' ? (ticket.finishedAt ?? at) : at) : null,
        version: sql`${kitchenTicket.version} + 1`,
      })
      .where(and(eq(kitchenTicket.id, ticketId), eq(kitchenTicket.storeId, storeId)));
  },

  // ---- Conta no PDV ----

  async setItemDiscount(tx, { storeId, itemId }, { cents, reason }) {
    await tx
      .update(orderItem)
      .set({ discountCents: cents, discountReason: reason })
      .where(and(eq(orderItem.id, itemId), eq(orderItem.storeId, storeId)));
  },

  async updateBill(tx, { storeId, orderId }, changes) {
    await tx
      .update(customerOrder)
      .set({ ...changes, version: sql`${customerOrder.version} + 1` })
      .where(and(eq(customerOrder.id, orderId), eq(customerOrder.storeId, storeId)));
  },

  async closeOrderAsPaid(tx, { storeId, orderId }, data) {
    await tx
      .update(customerOrder)
      .set({
        status: 'FECHADO',
        closedBy: data.by,
        closedAt: data.at,
        itemsCents: data.itemsCents,
        discountsCents: data.discountsCents,
        serviceFeeCents: data.serviceFeeCents,
        totalCents: data.totalCents,
        version: sql`${customerOrder.version} + 1`,
      })
      .where(and(eq(customerOrder.id, orderId), eq(customerOrder.storeId, storeId)));
  },

  async moveTickets(tx, fromOrderId, toOrderId) {
    await tx
      .update(kitchenTicket)
      .set({ orderId: toOrderId, version: sql`${kitchenTicket.version} + 1` })
      .where(eq(kitchenTicket.orderId, fromOrderId));
  },

  // ---- Cozinha ----

  listQueue(tx, { storeId, stationId }) {
    // Usa ix_kitchen_ticket_queue (loja, estação, situação, hora do envio)
    return selectTickets(tx)
      .where(
        and(
          eq(kitchenTicket.storeId, storeId),
          eq(kitchenTicket.stationId, stationId),
          inArray(kitchenTicket.status, ['NOVO', 'EM_PREPARO']),
        ),
      )
      .orderBy(asc(kitchenTicket.createdAt), asc(kitchenTicket.id));
  },

  listFinished(tx, { storeId, stationId }, { status, since, limit }) {
    // Usa ix_kitchen_ticket_finished (loja, estação, saída da fila)
    return selectTickets(tx)
      .where(
        and(
          eq(kitchenTicket.storeId, storeId),
          eq(kitchenTicket.stationId, stationId),
          gte(kitchenTicket.finishedAt, since),
          eq(kitchenTicket.status, status),
        ),
      )
      .orderBy(desc(kitchenTicket.finishedAt), desc(kitchenTicket.id))
      .limit(limit);
  },

  async findTicket(tx, { storeId, ticketId }, options = {}) {
    const query = selectTickets(tx).where(
      and(eq(kitchenTicket.id, ticketId), eq(kitchenTicket.storeId, storeId)),
    );
    // Com trava, as linhas da conta e da rodada também ficam travadas: quem chama já travou a conta
    const [row] = options.forUpdate ? await query.for('update') : await query;
    return row ?? null;
  },

  async listTicketItems(tx, storeId, ticketIds, options = {}) {
    if (ticketIds.length === 0) return [];
    const query = tx
      .select(kitchenItemColumns)
      .from(orderItem)
      .where(
        and(eq(orderItem.storeId, storeId), inArray(orderItem.kitchenTicketId, [...ticketIds])),
      )
      .orderBy(asc(orderItem.id));
    const rows = options.forUpdate ? await query.for('update') : await query;
    return withModifiers(tx, rows, options);
  },

  async findKitchenItem(tx, { storeId, itemId }, options = {}) {
    const query = tx
      .select(kitchenItemColumns)
      .from(orderItem)
      .where(and(eq(orderItem.id, itemId), eq(orderItem.storeId, storeId)));
    const rows = options.forUpdate ? await query.for('update') : await query;
    const [item] = await withModifiers(tx, rows, options);
    return item ?? null;
  },

  // Alterações: SEMPRE com a loja no WHERE (ADR-0009 — achado I-3 da revisão)
  async startItems(tx, storeId, itemIds, { by, at }) {
    if (itemIds.length === 0) return;
    await tx
      .update(orderItem)
      .set({ status: 'EM_PREPARO', startedAt: at, startedBy: by })
      .where(
        and(
          eq(orderItem.storeId, storeId),
          inArray(orderItem.id, [...itemIds]),
          eq(orderItem.status, 'ENVIADO'),
        ),
      );
  },

  async readyItems(tx, storeId, itemIds, { by, at }) {
    if (itemIds.length === 0) return;
    await tx
      .update(orderItem)
      .set({ status: 'PRONTO', readyAt: at, readyBy: by })
      .where(
        and(
          eq(orderItem.storeId, storeId),
          inArray(orderItem.id, [...itemIds]),
          inArray(orderItem.status, ['ENVIADO', 'EM_PREPARO']),
        ),
      );
  },

  async undoReady(tx, storeId, itemId, { startedAt }) {
    await tx
      .update(orderItem)
      .set({ status: 'EM_PREPARO', startedAt, readyAt: null, readyBy: null })
      .where(
        and(
          eq(orderItem.storeId, storeId),
          eq(orderItem.id, itemId),
          eq(orderItem.status, 'PRONTO'),
        ),
      );
  },
};
