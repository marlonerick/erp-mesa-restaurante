import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  customerOrder,
  kitchenTicket,
  orderItem,
  orderItemModifier,
  orderRound,
  storeSequence,
} from '@/shared/db/schema';
import { newId } from '@/shared/kernel';
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
};

type ItemRow = Omit<ItemRecord, 'modifiers'>;

/** Junta os adicionais (congelados) aos itens. */
async function withModifiers(
  tx: Parameters<OrdersRepository['listItems']>[0],
  rows: readonly ItemRow[],
  options: LockOption = {},
): Promise<ItemRecord[]> {
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

  async cancelTicketIfEmpty(tx, ticketId) {
    // Leitura com trava: outro cancelamento do mesmo ticket pode ter acabado de confirmar
    const [open] = await tx
      .select({ total: sql<string>`count(*)` })
      .from(orderItem)
      .where(and(eq(orderItem.kitchenTicketId, ticketId), ne(orderItem.status, 'CANCELADO')))
      .for('share');
    if (Number(open?.total ?? 0) > 0) return;
    await tx
      .update(kitchenTicket)
      .set({ status: 'CANCELADO', version: sql`${kitchenTicket.version} + 1` })
      .where(eq(kitchenTicket.id, ticketId));
  },

  async moveTickets(tx, fromOrderId, toOrderId) {
    await tx
      .update(kitchenTicket)
      .set({ orderId: toOrderId, version: sql`${kitchenTicket.version} + 1` })
      .where(eq(kitchenTicket.orderId, fromOrderId));
  },
};
