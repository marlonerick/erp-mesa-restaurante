import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  ne,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import {
  appUser,
  auditLog,
  cashMovement,
  cashSession,
  cashSessionCount,
  category,
  customerOrder,
  diningTable,
  ingredient,
  ingredientStock,
  orderItem,
  payment,
  product,
  stockMovement,
  terminal,
} from '@/shared/db/schema';
import type { Transaction } from '@/shared/db/transaction';
import type { Id } from '@/shared/kernel';
import type { ReportsRepository } from '../application/ports';

// Consultas SOMENTE LEITURA sobre tabelas de vários módulos (exceção documentada — reports.md).
// Toda consulta filtra a loja (ADR-0009). SUM/COUNT chegam como texto: convertidos com Number().

const n = (value: string | number | null | undefined) => Number(value ?? 0);
const sumOf = (column: SQLWrapper) => sql<string>`coalesce(sum(${column}), 0)`;

/** Itens que contam como venda: de contas FECHADAS no período, não cancelados (RN-REP-02). */
function soldItems(storeId: Id, from: string, to: string) {
  return and(
    eq(customerOrder.storeId, storeId),
    eq(customerOrder.status, 'FECHADO'),
    gte(customerOrder.closedDate, from),
    lte(customerOrder.closedDate, to),
    ne(orderItem.status, 'CANCELADO'),
  );
}

const lineGross = sql`(${orderItem.unitPriceCents} + ${orderItem.modifiersCents}) * ${orderItem.quantity}`;

/** Cópias das tabelas para a subconsulta de custo (escopo próprio, sem colidir com a consulta de fora). */
const soldItem = alias(orderItem, 'sold_item');
const soldOrder = alias(customerOrder, 'sold_order');

export const reportsRepository: ReportsRepository = {
  // ---- Vendas ----

  async closedOrdersByDay(tx: Transaction, storeId: Id, from: string, to: string) {
    const rows = await tx
      .select({
        date: customerOrder.closedDate,
        orders: count(),
        items: sumOf(customerOrder.itemsCents),
        discounts: sumOf(customerOrder.discountsCents),
        serviceFee: sumOf(customerOrder.serviceFeeCents),
        total: sumOf(customerOrder.totalCents),
      })
      .from(customerOrder)
      .where(
        and(
          eq(customerOrder.storeId, storeId),
          eq(customerOrder.status, 'FECHADO'),
          gte(customerOrder.closedDate, from),
          lte(customerOrder.closedDate, to),
        ),
      )
      .groupBy(customerOrder.closedDate)
      .orderBy(asc(customerOrder.closedDate));
    return rows.map((row) => ({
      date: row.date ?? from,
      orders: n(row.orders),
      itemsCents: n(row.items),
      discountsCents: n(row.discounts),
      serviceFeeCents: n(row.serviceFee),
      totalCents: n(row.total),
    }));
  },

  async salesByCategory(tx: Transaction, storeId: Id, from: string, to: string) {
    const rows = await tx
      .select({
        name: category.name,
        quantity: sumOf(orderItem.quantity),
        gross: sumOf(lineGross),
        discounts: sumOf(orderItem.discountCents),
      })
      .from(orderItem)
      .innerJoin(customerOrder, eq(customerOrder.id, orderItem.orderId))
      .innerJoin(product, eq(product.id, orderItem.productId))
      .innerJoin(category, eq(category.id, product.categoryId))
      .where(soldItems(storeId, from, to))
      .groupBy(category.id, category.name)
      .orderBy(desc(sumOf(lineGross)));
    return rows.map((row) => ({
      name: row.name,
      quantity: n(row.quantity),
      grossCents: n(row.gross),
      discountsCents: n(row.discounts),
    }));
  },

  /** Pagamentos ativos pelo dia operacional do caixa que recebeu (RN-REP-04). */
  async paymentsByMethod(tx: Transaction, storeId: Id, from: string, to: string) {
    const rows = await tx
      .select({ method: payment.method, payments: count(), amount: sumOf(payment.amountCents) })
      .from(payment)
      .innerJoin(cashSession, eq(cashSession.id, payment.cashSessionId))
      .where(
        and(
          eq(payment.storeId, storeId),
          eq(payment.status, 'ATIVO'),
          gte(cashSession.operationalDate, from),
          lte(cashSession.operationalDate, to),
        ),
      )
      .groupBy(payment.method)
      .orderBy(desc(sumOf(payment.amountCents)));
    return rows.map((row) => ({
      method: row.method,
      payments: n(row.payments),
      amountCents: n(row.amount),
    }));
  },

  /**
   * Vendas por produto com custo da ficha NO MOMENTO da venda (E9-7): consumo menos estorno das
   * movimentações de estoque ligadas a cada item (valor negativo = saída).
   */
  async salesByProduct(
    tx: Transaction,
    storeId: Id,
    from: string,
    to: string,
    page: { offset: number; limit: number } | null,
  ) {
    // Só os itens vendidos no período (achado I-3 da revisão: antes somava todo o histórico da loja)
    const costs = tx
      .select({
        itemId: stockMovement.originId,
        cost: sql<string>`-sum(${stockMovement.valueCents})`.as('cost'),
      })
      .from(soldItem)
      .innerJoin(soldOrder, eq(soldOrder.id, soldItem.orderId))
      .innerJoin(
        stockMovement,
        and(
          eq(stockMovement.originId, soldItem.id),
          eq(stockMovement.originType, 'ORDER_ITEM'),
          eq(stockMovement.storeId, storeId),
          inArray(stockMovement.type, ['CONSUMO_VENDA', 'ESTORNO_VENDA']),
        ),
      )
      .where(
        and(
          eq(soldOrder.storeId, storeId),
          eq(soldOrder.status, 'FECHADO'),
          gte(soldOrder.closedDate, from),
          lte(soldOrder.closedDate, to),
          ne(soldItem.status, 'CANCELADO'),
        ),
      )
      .groupBy(stockMovement.originId)
      .as('costs');
    const query = tx
      .select({
        productId: orderItem.productId,
        name: sql<string>`max(${orderItem.productName})`,
        quantity: sumOf(orderItem.quantity),
        gross: sumOf(lineGross),
        discounts: sumOf(orderItem.discountCents),
        cost: sumOf(costs.cost),
      })
      .from(orderItem)
      .innerJoin(customerOrder, eq(customerOrder.id, orderItem.orderId))
      .leftJoin(costs, eq(costs.itemId, orderItem.id))
      .where(soldItems(storeId, from, to))
      .groupBy(orderItem.productId)
      .orderBy(desc(sumOf(lineGross)), asc(orderItem.productId));
    const rows = page ? await query.limit(page.limit).offset(page.offset) : await query;
    const [total] = await tx
      .select({ total: sql<string>`count(distinct ${orderItem.productId})` })
      .from(orderItem)
      .innerJoin(customerOrder, eq(customerOrder.id, orderItem.orderId))
      .where(soldItems(storeId, from, to));
    return {
      total: n(total?.total),
      rows: rows.map((row) => ({
        productId: row.productId,
        name: row.name,
        quantity: n(row.quantity),
        grossCents: n(row.gross),
        discountsCents: n(row.discounts),
        costCents: n(row.cost),
      })),
    };
  },

  /** Mais vendidos por QUANTIDADE (painel — sem custo, leve a cada 30 s). */
  async topProducts(tx: Transaction, storeId: Id, day: string, limit: number) {
    const quantity = sumOf(orderItem.quantity);
    const rows = await tx
      .select({ name: sql<string>`max(${orderItem.productName})`, quantity })
      .from(orderItem)
      .innerJoin(customerOrder, eq(customerOrder.id, orderItem.orderId))
      .where(soldItems(storeId, day, day))
      .groupBy(orderItem.productId)
      .orderBy(desc(quantity), asc(sql`max(${orderItem.productName})`))
      .limit(limit);
    return rows.map((row) => ({ name: row.name, quantity: n(row.quantity) }));
  },

  // ---- Caixa ----

  async cashSessions(tx: Transaction, storeId: Id, from: string, to: string) {
    return tx
      .select({
        id: cashSession.id,
        status: cashSession.status,
        operationalDate: cashSession.operationalDate,
        terminalCode: terminal.code,
        terminalName: terminal.name,
        openedBy: cashSession.openedBy,
        openedAt: cashSession.openedAt,
        closedBy: cashSession.closedBy,
        closedAt: cashSession.closedAt,
        openingCents: cashSession.openingAmountCents,
      })
      .from(cashSession)
      .innerJoin(terminal, eq(terminal.id, cashSession.terminalId))
      .where(
        and(
          eq(cashSession.storeId, storeId),
          gte(cashSession.operationalDate, from),
          lte(cashSession.operationalDate, to),
        ),
      )
      .orderBy(asc(cashSession.operationalDate), asc(cashSession.openedAt));
  },

  /** Soma das movimentações por caixa e tipo (valor absoluto). */
  async cashMovementTotals(tx: Transaction, storeId: Id, sessionIds: readonly Id[]) {
    if (sessionIds.length === 0) return [];
    const rows = await tx
      .select({
        sessionId: cashMovement.cashSessionId,
        type: cashMovement.type,
        amount: sql<string>`coalesce(sum(abs(${cashMovement.amountCents})), 0)`,
      })
      .from(cashMovement)
      .where(
        and(
          eq(cashMovement.storeId, storeId),
          inArray(cashMovement.cashSessionId, [...sessionIds]),
        ),
      )
      .groupBy(cashMovement.cashSessionId, cashMovement.type);
    return rows.map((row) => ({
      sessionId: row.sessionId,
      type: row.type,
      amountCents: n(row.amount),
    }));
  },

  /** Movimentações EM DINHEIRO dos caixas, em ordem (sangrias acima do esperado). */
  cashMovements(tx: Transaction, storeId: Id, sessionIds: readonly Id[]) {
    if (sessionIds.length === 0) return Promise.resolve([]);
    return tx
      .select({
        id: cashMovement.id,
        sessionId: cashMovement.cashSessionId,
        type: cashMovement.type,
        paymentMethod: cashMovement.paymentMethod,
        amountCents: cashMovement.amountCents,
        reason: cashMovement.reason,
        userId: cashMovement.userId,
        occurredAt: cashMovement.occurredAt,
      })
      .from(cashMovement)
      .where(
        and(
          eq(cashMovement.storeId, storeId),
          eq(cashMovement.paymentMethod, 'DINHEIRO'),
          inArray(cashMovement.cashSessionId, [...sessionIds]),
        ),
      )
      .orderBy(asc(cashMovement.id));
  },

  cashCounts(tx: Transaction, storeId: Id, sessionIds: readonly Id[]) {
    if (sessionIds.length === 0) return Promise.resolve([]);
    return tx
      .select({
        sessionId: cashSessionCount.cashSessionId,
        method: cashSessionCount.paymentMethod,
        expectedCents: cashSessionCount.expectedCents,
        declaredCents: cashSessionCount.declaredCents,
        differenceCents: cashSessionCount.differenceCents,
      })
      .from(cashSessionCount)
      .innerJoin(cashSession, eq(cashSession.id, cashSessionCount.cashSessionId))
      .where(
        and(
          eq(cashSession.storeId, storeId),
          eq(cashSession.status, 'FECHADA'),
          inArray(cashSessionCount.cashSessionId, [...sessionIds]),
        ),
      );
  },

  // ---- Estoque ----

  async stockBalances(tx: Transaction, storeId: Id) {
    const rows = await tx
      .select({
        ingredientId: ingredient.id,
        name: ingredient.name,
        unit: ingredient.baseUnit,
        quantity: ingredientStock.quantity,
        minQuantity: ingredientStock.minQuantity,
        avgUnitCost: ingredientStock.avgUnitCost,
      })
      .from(ingredientStock)
      .innerJoin(ingredient, eq(ingredient.id, ingredientStock.ingredientId))
      .where(and(eq(ingredientStock.storeId, storeId), eq(ingredient.active, true)))
      .orderBy(asc(ingredient.name));
    return rows;
  },

  async stockMovementsByType(tx: Transaction, storeId: Id, from: string, to: string) {
    const rows = await tx
      .select({
        type: stockMovement.type,
        movements: count(),
        value: sumOf(stockMovement.valueCents),
      })
      .from(stockMovement)
      .where(
        and(
          eq(stockMovement.storeId, storeId),
          gte(stockMovement.operationalDate, from),
          lte(stockMovement.operationalDate, to),
        ),
      )
      .groupBy(stockMovement.type);
    return rows.map((row) => ({
      type: row.type,
      movements: n(row.movements),
      valueCents: n(row.value),
    }));
  },

  // ---- Operação ----

  async ordersOpened(tx: Transaction, storeId: Id, from: string, to: string) {
    const rows = await tx
      .select({
        type: customerOrder.type,
        status: customerOrder.status,
        merged: sql<string>`sum(${customerOrder.mergedIntoOrderId} is not null)`,
        orders: count(),
        guests: sumOf(customerOrder.guests),
        withGuests: sql<string>`sum(${customerOrder.guests} is not null)`,
        waived: sql<string>`sum(${customerOrder.serviceFeeWaived})`,
      })
      .from(customerOrder)
      .where(
        and(
          eq(customerOrder.storeId, storeId),
          gte(customerOrder.openedDate, from),
          lte(customerOrder.openedDate, to),
        ),
      )
      .groupBy(customerOrder.type, customerOrder.status);
    return rows.map((row) => ({
      type: row.type,
      status: row.status,
      orders: n(row.orders),
      merged: n(row.merged),
      guests: n(row.guests),
      withGuests: n(row.withGuests),
      serviceFeeWaived: n(row.waived),
    }));
  },

  /** Itens cancelados das contas abertas no período, por motivo. */
  async cancelledItems(tx: Transaction, storeId: Id, from: string, to: string) {
    const rows = await tx
      .select({
        reason: orderItem.cancelReason,
        items: count(),
        value: sumOf(lineGross),
      })
      .from(orderItem)
      .innerJoin(customerOrder, eq(customerOrder.id, orderItem.orderId))
      .where(
        and(
          eq(customerOrder.storeId, storeId),
          gte(customerOrder.openedDate, from),
          lte(customerOrder.openedDate, to),
          eq(orderItem.status, 'CANCELADO'),
        ),
      )
      .groupBy(orderItem.cancelReason)
      .orderBy(desc(count()));
    return rows.map((row) => ({
      reason: row.reason ?? '',
      items: n(row.items),
      valueCents: n(row.value),
    }));
  },

  // ---- Painel ----

  async openOrders(tx: Transaction, storeId: Id) {
    const [row] = await tx
      .select({ orders: count() })
      .from(customerOrder)
      .where(and(eq(customerOrder.storeId, storeId), eq(customerOrder.status, 'ABERTO')));
    return n(row?.orders);
  },

  async occupiedTables(tx: Transaction, storeId: Id) {
    const [row] = await tx
      .select({ tables: count() })
      .from(diningTable)
      .where(
        and(
          eq(diningTable.storeId, storeId),
          eq(diningTable.active, true),
          inArray(diningTable.status, ['OCUPADA', 'AGUARDANDO_CONTA', 'EM_PAGAMENTO']),
        ),
      );
    return n(row?.tables);
  },

  /** Itens na cozinha (enviados + em preparo) e os enviados antes de `lateBefore`. */
  async kitchenItems(tx: Transaction, storeId: Id, lateBefore: Date) {
    const [row] = await tx
      .select({
        items: count(),
        late: sql<string>`sum(${orderItem.sentAt} < ${lateBefore.toISOString().slice(0, 23).replace('T', ' ')})`,
      })
      .from(orderItem)
      .where(
        and(eq(orderItem.storeId, storeId), inArray(orderItem.status, ['ENVIADO', 'EM_PREPARO'])),
      );
    return { items: n(row?.items), late: n(row?.late) };
  },

  openCashSessions(tx: Transaction, storeId: Id) {
    return tx
      .select({
        id: cashSession.id,
        terminalCode: terminal.code,
        terminalName: terminal.name,
        openedBy: cashSession.openedBy,
        openedAt: cashSession.openedAt,
      })
      .from(cashSession)
      .innerJoin(terminal, eq(terminal.id, cashSession.terminalId))
      .where(and(eq(cashSession.storeId, storeId), eq(cashSession.status, 'ABERTA')))
      .orderBy(asc(cashSession.openedAt));
  },

  async lowStock(tx: Transaction, storeId: Id) {
    return tx
      .select({
        name: ingredient.name,
        unit: ingredient.baseUnit,
        quantity: ingredientStock.quantity,
        minQuantity: ingredientStock.minQuantity,
      })
      .from(ingredientStock)
      .innerJoin(ingredient, eq(ingredient.id, ingredientStock.ingredientId))
      .where(
        and(
          eq(ingredientStock.storeId, storeId),
          eq(ingredient.active, true),
          sql`${ingredientStock.minQuantity} > 0`,
          sql`${ingredientStock.quantity} <= ${ingredientStock.minQuantity}`,
        ),
      )
      .orderBy(asc(ingredient.name))
      .limit(20);
  },

  // ---- Auditoria (RN-REP-08) ----

  async audit(
    tx: Transaction,
    filter: { storeId: Id; start: Date; end: Date; event: string | null; userId: Id | null },
    page: { offset: number; limit: number } | null,
  ) {
    const conditions: SQL[] = [
      eq(auditLog.storeId, filter.storeId),
      gte(auditLog.occurredAt, filter.start),
      lt(auditLog.occurredAt, filter.end),
    ];
    if (filter.event) conditions.push(eq(auditLog.event, filter.event));
    if (filter.userId) conditions.push(eq(auditLog.actorUserId, filter.userId));
    const where = and(...conditions);
    const query = tx
      .select({
        id: auditLog.id,
        event: auditLog.event,
        occurredAt: auditLog.occurredAt,
        actorUserId: auditLog.actorUserId,
        actorName: appUser.name,
        authorizerUserId: auditLog.authorizerUserId,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        beforeData: auditLog.beforeData,
        afterData: auditLog.afterData,
      })
      .from(auditLog)
      .leftJoin(appUser, eq(appUser.id, auditLog.actorUserId))
      .where(where)
      .orderBy(desc(auditLog.occurredAt), desc(auditLog.id));
    const rows = page ? await query.limit(page.limit).offset(page.offset) : await query;
    const [total] = await tx.select({ total: count() }).from(auditLog).where(where);
    return { rows, total: n(total?.total) };
  },
};
