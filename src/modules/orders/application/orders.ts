import { recordAuditFromContext } from '@/modules/audit';
import type { MenuProduct } from '@/modules/catalog';
import type { StockShortage } from '@/modules/inventory';
import type { StoreInfo } from '@/modules/organizations';
import { type TableRecord, tableErrors, tablesLabel, type TableStatus } from '@/modules/tables';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import { executeIdempotent, type Jsonified } from '@/shared/idempotency/idempotency';
import {
  DomainError,
  type Id,
  newId,
  operationalDate,
  type RequestContext,
  requirePermission,
} from '@/shared/kernel';
import {
  cancelReason,
  cancelStockEffect,
  chooseModifiers,
  counterLabel,
  guestsCount,
  isSent,
  itemNotes,
  itemQuantity,
  MAX_ITEMS_PER_ORDER,
  MERGED_REASON,
  optionalReason,
  subtotal,
} from '../domain/rules';
import type {
  ItemRecord,
  OpenOrderSummary,
  OrderRecord,
  OrdersDependencies,
  RoundRecord,
} from './ports';

// ---- Erros (docs/modules/orders.md §6) ----

const rule = (code: string, message: string) => new DomainError(code, message, 'BUSINESS_RULE');

export const orderErrors = {
  storeNotFound: () => new DomainError('STORE_NOT_FOUND', 'Loja não encontrada.', 'NOT_FOUND'),
  orderNotFound: () => new DomainError('ORDER_NOT_FOUND', 'Conta não encontrada.', 'NOT_FOUND'),
  itemNotFound: () => new DomainError('ORDER_ITEM_NOT_FOUND', 'Item não encontrado.', 'NOT_FOUND'),
  tableNotAvailable: () =>
    rule('TABLE_NOT_AVAILABLE', 'Esta mesa não está livre. Recarregue o mapa.'),
  orderNotOpen: () => rule('ORDER_NOT_OPEN', 'Esta conta não está mais aberta.'),
  productNotAvailable: () =>
    rule('PRODUCT_NOT_AVAILABLE', 'Este produto não está à venda agora nesta loja.'),
  itemLimit: () => rule('ORDER_ITEM_LIMIT', 'Esta conta chegou a 300 itens.'),
  alreadySent: () =>
    rule('ITEM_ALREADY_SENT', 'Este item já foi para a cozinha: cancele com motivo.'),
  notSent: () => rule('ITEM_NOT_SENT', 'Este item ainda não foi enviado: remova-o da conta.'),
  nothingToSend: () => rule('NOTHING_TO_SEND', 'Não há itens pendentes para enviar.'),
  itemsChanged: () =>
    new DomainError(
      'ITEMS_CHANGED',
      'Os itens da conta mudaram. Confira e envie de novo.',
      'CONFLICT',
    ),
  notReady: () => rule('ITEM_NOT_READY', 'Este item ainda não está pronto.'),
  alreadyCancelled: () => rule('ITEM_ALREADY_CANCELLED', 'Este item já foi cancelado.'),
  pendingItems: () => rule('PENDING_ITEMS', 'Envie ou remova os itens ainda não enviados.'),
  notTableOrder: () => rule('NOT_A_TABLE_ORDER', 'Esta ação vale só para conta de mesa.'),
  sameOrder: () => rule('SAME_ORDER', 'Esta mesa já está nesta conta.'),
  needsTable: () => rule('ORDER_NEEDS_TABLE', 'A conta precisa ficar com pelo menos uma mesa.'),
  hasSentItems: () =>
    rule('ORDER_HAS_SENT_ITEMS', 'Cancele os itens enviados antes de cancelar a conta.'),
  concurrent: () =>
    new DomainError(
      'CONCURRENT_MODIFICATION',
      'Outra pessoa alterou esta conta. A tela foi atualizada; confira e tente de novo.',
      'CONFLICT',
    ),
};

// ---- Apoio ----

/**
 * Leituras feitas DEPOIS de travar a conta também usam trava (RN-ORD-21). Em REPEATABLE READ, uma
 * leitura comum devolve a "foto" do início da transação: quem esperou a trava não veria o que o
 * outro garçom acabou de gravar (mesmo problema do achado B-1 da Etapa 5).
 */
const LOCK = { forUpdate: true } as const;

async function activeStore(
  deps: OrdersDependencies,
  tx: Transaction,
  ctx: RequestContext,
): Promise<StoreInfo> {
  const found = await deps.stores.findStore(tx, ctx.storeId);
  if (found?.organizationId !== ctx.organizationId) throw orderErrors.storeNotFound();
  return found;
}

/** Trava a conta da loja ativa (RN-ORD-21: lançamentos entram em fila). */
async function lockOrder(
  deps: OrdersDependencies,
  tx: Transaction,
  ctx: RequestContext,
  orderId: Id,
  options: { version?: number; mustBeOpen?: boolean } = {},
): Promise<OrderRecord> {
  const order = await deps.repo.findOrder(
    tx,
    { storeId: ctx.storeId, orderId },
    { forUpdate: true },
  );
  if (!order) throw orderErrors.orderNotFound();
  if (options.version !== undefined && order.version !== options.version) {
    throw orderErrors.concurrent();
  }
  if ((options.mustBeOpen ?? true) && order.status !== 'ABERTO') throw orderErrors.orderNotOpen();
  return order;
}

/** Item da loja ativa + a conta dele travada; o item é relido depois da trava. */
async function lockItem(
  deps: OrdersDependencies,
  tx: Transaction,
  ctx: RequestContext,
  itemId: Id,
): Promise<{ order: OrderRecord; item: ItemRecord }> {
  const found = await deps.repo.findItem(tx, { storeId: ctx.storeId, itemId });
  if (!found) throw orderErrors.itemNotFound();
  const order = await lockOrder(deps, tx, ctx, found.orderId);
  // Relê COM TRAVA depois da trava da conta: outro garçom pode ter mexido no item (ou juntado a
  // conta) enquanto esta transação esperava
  const item = await deps.repo.findItem(tx, { storeId: ctx.storeId, itemId }, LOCK);
  if (item?.orderId !== order.id) throw orderErrors.concurrent();
  return { order, item };
}

async function changeTables(
  deps: OrdersDependencies,
  tx: Transaction,
  ctx: RequestContext,
  tables: readonly TableRecord[],
  status: TableStatus,
  orderId: Id | null,
) {
  const changed = tables.filter(
    (table) => table.status !== status || table.currentOrderId !== orderId,
  );
  if (changed.length === 0) return;
  await deps.tables.setState(
    tx,
    changed.map((table) => table.id),
    { status, currentOrderId: orderId },
  );
  await recordAuditFromContext(tx, ctx, 'TABLE_STATUS_CHANGED', {
    entityType: 'dining_table',
    entityId: changed.map((table) => table.id).join(','),
    before: { tables: changed.map((table) => ({ number: table.number, status: table.status })) },
    after: { status },
  });
}

// ---- Leitura ----

export interface FloorTable {
  readonly id: Id;
  readonly number: string;
  readonly area: string | null;
  readonly seats: number;
  readonly status: TableStatus;
  readonly order: OpenOrderSummary | null;
}

export interface Floor {
  readonly tables: FloorTable[];
  readonly counter: OpenOrderSummary[];
}

/** Mapa do salão + contas de balcão abertas (RN-TAB-07). */
export async function floor(deps: OrdersDependencies, ctx: RequestContext): Promise<Floor> {
  requirePermission(ctx, 'tables.read');
  requirePermission(ctx, 'orders.read');
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const tables = await deps.tables.listActive(tx, ctx.storeId);
    const orders = new Map(
      (await deps.repo.listOpenOrders(tx, ctx.storeId)).map((order) => [order.id, order]),
    );
    return {
      tables: tables.map((table) => ({
        id: table.id,
        number: table.number,
        area: table.area,
        seats: table.seats,
        status: table.status,
        order: table.currentOrderId ? (orders.get(table.currentOrderId) ?? null) : null,
      })),
      counter: [...orders.values()]
        .filter((order) => order.type === 'BALCAO')
        .sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime()),
    };
  });
}

export interface OrderItemView extends ItemRecord {
  readonly totalCents: number;
}

export interface RoundView extends RoundRecord {
  readonly sentByName: string | null;
  readonly items: OrderItemView[];
}

export interface OrderDetail extends OrderRecord {
  readonly tables: { id: Id; number: string; status: TableStatus }[];
  readonly pending: OrderItemView[];
  readonly rounds: RoundView[];
  readonly subtotalCents: number;
}

const itemView = (item: ItemRecord): OrderItemView => ({
  ...item,
  totalCents:
    item.status === 'CANCELADO' ? 0 : (item.unitPriceCents + item.modifiersCents) * item.quantity,
});

/** A comanda: pendentes, rodadas enviadas (mais nova primeiro) e subtotal. */
export async function getOrder(
  deps: OrdersDependencies,
  ctx: RequestContext,
  orderId: Id,
): Promise<OrderDetail> {
  requirePermission(ctx, 'orders.read');
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const order = await deps.repo.findOrder(tx, { storeId: ctx.storeId, orderId });
    if (!order) throw orderErrors.orderNotFound();
    const items = await deps.repo.listItems(tx, order.id);
    const rounds = await deps.repo.listRounds(tx, order.id);
    const names = await deps.userNames(tx, [...new Set(rounds.map((round) => round.sentBy))]);
    const tables = (await deps.tables.listActive(tx, ctx.storeId)).filter(
      (table) => table.currentOrderId === order.id,
    );
    return {
      ...order,
      tables: tables.map((table) => ({ id: table.id, number: table.number, status: table.status })),
      pending: items.filter((item) => item.status === 'PENDENTE').map(itemView),
      rounds: rounds
        .map((round) => ({
          ...round,
          sentByName: names.get(round.sentBy) ?? null,
          items: items.filter((item) => item.roundId === round.id).map(itemView),
        }))
        .reverse(),
      subtotalCents: subtotal(items),
    };
  });
}

/** Cardápio vendável agora na loja ativa (RN-CAT-10), para lançar. */
export async function menu(deps: OrdersDependencies, ctx: RequestContext): Promise<MenuProduct[]> {
  requirePermission(ctx, 'orders.create');
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    return deps.menu(tx, { companyId, storeId: ctx.storeId });
  });
}

// ---- Abertura (RN-ORD-02 a RN-ORD-04) ----

async function nextNumber(deps: OrdersDependencies, tx: Transaction, ctx: RequestContext) {
  const settings = await deps.stores.settings(tx, {
    organizationId: ctx.organizationId,
    storeId: ctx.storeId,
  });
  if (!settings) throw orderErrors.storeNotFound();
  const day = operationalDate(ctx.clock.now(), settings.timezone, settings.operationalDayCutoff);
  return { day, number: await deps.repo.nextOrderNumber(tx, ctx.storeId, day) };
}

export async function openTable(
  deps: OrdersDependencies,
  ctx: RequestContext,
  input: { tableId: Id; guests?: number | null },
): Promise<{ orderId: Id }> {
  requirePermission(ctx, 'orders.create');
  const guests = guestsCount(input.guests);
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const [table] = await deps.tables.lock(tx, ctx.storeId, [input.tableId]);
    if (!table) throw tableErrors.notFound();
    if (!table.active || table.status !== 'LIVRE') throw orderErrors.tableNotAvailable();
    const { day, number } = await nextNumber(deps, tx, ctx);
    const orderId = newId();
    await deps.repo.insertOrder(tx, {
      id: orderId,
      storeId: ctx.storeId,
      number,
      openedDate: day,
      type: 'MESA',
      label: table.number,
      guests,
      openedBy: ctx.userId,
      openedAt: ctx.clock.now(),
    });
    await deps.tables.setState(tx, [table.id], { status: 'OCUPADA', currentOrderId: orderId });
    await recordAuditFromContext(tx, ctx, 'ORDER_OPENED', {
      entityType: 'customer_order',
      entityId: orderId,
      after: { type: 'MESA', table: table.number, number, guests },
    });
    return { orderId };
  });
}

export async function openCounter(
  deps: OrdersDependencies,
  ctx: RequestContext,
  input: { label: string },
): Promise<{ orderId: Id }> {
  requirePermission(ctx, 'orders.create');
  const label = counterLabel(input.label);
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const { day, number } = await nextNumber(deps, tx, ctx);
    const orderId = newId();
    await deps.repo.insertOrder(tx, {
      id: orderId,
      storeId: ctx.storeId,
      number,
      openedDate: day,
      type: 'BALCAO',
      label,
      guests: null,
      openedBy: ctx.userId,
      openedAt: ctx.clock.now(),
    });
    await recordAuditFromContext(tx, ctx, 'ORDER_OPENED', {
      entityType: 'customer_order',
      entityId: orderId,
      after: { type: 'BALCAO', label, number },
    });
    return { orderId };
  });
}

// ---- Itens (RN-ORD-05 a RN-ORD-09) ----

export async function addItem(
  deps: OrdersDependencies,
  ctx: RequestContext,
  input: {
    orderId: Id;
    productId: Id;
    quantity: number;
    modifierIds?: readonly Id[];
    notes?: string | null;
  },
): Promise<{ itemId: Id }> {
  requirePermission(ctx, 'orders.create');
  const quantity = itemQuantity(input.quantity);
  const notes = itemNotes(input.notes);
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const order = await lockOrder(deps, tx, ctx, input.orderId);
    if ((await deps.repo.countItems(tx, order.id, LOCK)) >= MAX_ITEMS_PER_ORDER) {
      throw orderErrors.itemLimit();
    }
    const product = (await deps.menu(tx, { companyId, storeId: ctx.storeId })).find(
      (item) => item.productId === input.productId,
    );
    if (!product) throw orderErrors.productNotAvailable();
    const modifiers = chooseModifiers(product.modifierGroups, input.modifierIds ?? []);
    const itemId = newId();
    await deps.repo.insertItem(tx, {
      id: itemId,
      storeId: ctx.storeId,
      orderId: order.id,
      productId: product.productId,
      productName: product.name,
      unitPriceCents: product.priceCents,
      modifiersCents: modifiers.reduce((sum, extra) => sum + extra.priceDeltaCents, 0),
      quantity,
      notes,
      requiresPreparation: product.requiresPreparation,
      createdBy: ctx.userId,
      createdAt: ctx.clock.now(),
      modifiers,
    });
    // Cliente pediu mais depois de pedir a conta: a mesa volta a OCUPADA (RN-ORD-09)
    if (order.type === 'MESA') {
      const tables = await deps.tables.lockOfOrder(tx, ctx.storeId, order.id);
      const waiting = tables.filter((table) => table.status === 'AGUARDANDO_CONTA');
      await changeTables(deps, tx, ctx, waiting, 'OCUPADA', order.id);
    }
    await deps.repo.bumpOrder(tx, order.id);
    return { itemId };
  });
}

export async function removeItem(
  deps: OrdersDependencies,
  ctx: RequestContext,
  input: { itemId: Id },
): Promise<void> {
  requirePermission(ctx, 'orders.update');
  await runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const { order, item } = await lockItem(deps, tx, ctx, input.itemId);
    if (item.status !== 'PENDENTE') throw orderErrors.alreadySent();
    await deps.repo.deleteItems(tx, [item.id]);
    await deps.repo.bumpOrder(tx, order.id);
  });
}

// ---- Envio para a cozinha (RN-ORD-10, RN-ORD-11) ----

export interface SendResult {
  readonly roundNumber: number;
  /** Itens que foram para a cozinha. */
  readonly sent: number;
  /** Itens sem preparo, já prontos (Q-08). */
  readonly ready: number;
  /** Faltas de estoque com "permitir com alerta" (ADR-0007). */
  readonly warnings: StockShortage[];
}

export async function sendRound(
  deps: OrdersDependencies,
  ctx: RequestContext,
  input: { orderId: Id; itemIds: readonly Id[]; idempotencyKey: string },
): Promise<Jsonified<SendResult>> {
  requirePermission(ctx, 'orders.create');
  const itemIds = [...new Set(input.itemIds)].sort();
  if (itemIds.length === 0) throw orderErrors.nothingToSend();
  const outcome = await runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    return executeIdempotent<SendResult>(
      tx,
      {
        storeId: ctx.storeId,
        key: input.idempotencyKey,
        operation: 'orders.sendRound',
        payload: { orderId: input.orderId, itemIds },
      },
      async () => {
        const order = await lockOrder(deps, tx, ctx, input.orderId);
        const items = await deps.repo.listItems(tx, order.id, LOCK);
        const pending = new Map(
          items.filter((item) => item.status === 'PENDENTE').map((item) => [item.id, item]),
        );
        // Exatamente o que a tela mostrava: se algum item mudou, nada é enviado (RN-ORD-10)
        const toSend = itemIds.map((id) => pending.get(id));
        if (toSend.some((item) => item === undefined)) throw orderErrors.itemsChanged();
        const chosen = toSend.filter((item): item is ItemRecord => item !== undefined);

        const now = ctx.clock.now();
        const rounds = await deps.repo.listRounds(tx, order.id, LOCK);
        const round = {
          id: newId(),
          storeId: ctx.storeId,
          orderId: order.id,
          number: rounds.reduce((max, item) => Math.max(max, item.number), 0) + 1,
          sentBy: ctx.userId,
          sentAt: now,
        };
        await deps.repo.insertRound(tx, round);

        const kitchen = chosen.filter((item) => item.requiresPreparation);
        const ready = chosen.filter((item) => !item.requiresPreparation);
        if (kitchen.length > 0) {
          const station = await deps.stores.defaultStation(tx, ctx.storeId);
          if (!station) throw orderErrors.storeNotFound();
          const ticketId = newId();
          await deps.repo.insertTicket(tx, {
            id: ticketId,
            storeId: ctx.storeId,
            orderId: order.id,
            roundId: round.id,
            stationId: station.id,
            createdAt: now,
          });
          await deps.repo.markSent(
            tx,
            kitchen.map((item) => item.id),
            { roundId: round.id, status: 'ENVIADO', stationId: station.id, ticketId, at: now },
          );
        }
        if (ready.length > 0) {
          await deps.repo.markSent(
            tx,
            ready.map((item) => item.id),
            { roundId: round.id, status: 'PRONTO', stationId: null, ticketId: null, at: now },
          );
        }

        // Baixa de estoque na MESMA transação (ADR-0006 A): com BLOQUEAR, falta desfaz tudo
        const warnings = await deps.stock.consumeForItems(
          tx,
          ctx,
          chosen.map((item) => ({
            originId: item.id,
            productId: item.productId,
            quantity: item.quantity * 1000,
            modifiers: item.modifiers.map((extra) => ({
              modifierId: extra.modifierId,
              quantity: 1000,
            })),
          })),
        );
        await deps.repo.bumpOrder(tx, order.id);
        await recordAuditFromContext(tx, ctx, 'ORDER_ROUND_SENT', {
          entityType: 'customer_order',
          entityId: order.id,
          after: {
            round: round.number,
            items: chosen.map((item) => ({ product: item.productName, quantity: item.quantity })),
            stockWarnings: warnings.map((item) => item.name),
          },
        });
        return { roundNumber: round.number, sent: kitchen.length, ready: ready.length, warnings };
      },
    );
  });
  return outcome.result;
}

/** Garçom entregou o item pronto (RN-ORD-11a). */
export async function deliverItem(
  deps: OrdersDependencies,
  ctx: RequestContext,
  input: { itemId: Id },
): Promise<void> {
  requirePermission(ctx, 'orders.update');
  await runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const { order, item } = await lockItem(deps, tx, ctx, input.itemId);
    if (item.status !== 'PRONTO') throw orderErrors.notReady();
    await deps.repo.markDelivered(tx, item.id, { by: ctx.userId, at: ctx.clock.now() });
    await deps.repo.bumpOrder(tx, order.id);
  });
}

// ---- Cancelamento de item enviado (RN-ORD-12 a RN-ORD-14) ----

export async function cancelItem(
  deps: OrdersDependencies,
  ctx: RequestContext,
  input: { itemId: Id; reason: string; grantToken?: string | null },
): Promise<void> {
  requirePermission(ctx, 'orders.read');
  const reason = cancelReason(input.reason);
  await runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const { order, item } = await lockItem(deps, tx, ctx, input.itemId);
    if (item.status === 'CANCELADO') throw orderErrors.alreadyCancelled();
    if (item.status === 'PENDENTE') throw orderErrors.notSent();
    // Garçom e caixa: autorização do gerente no aparelho, consumida nesta transação (RN-AUTHZ-06)
    const { authorizerUserId } = await deps.authorizeOrElevate(
      tx,
      ctx,
      'orders.cancel',
      input.grantToken ?? null,
    );
    const effect = cancelStockEffect(item);
    if (item.stockConsumed) {
      if (effect === 'ESTORNO') await deps.stock.reverse(tx, ctx, item.id);
      else await deps.stock.toLoss(tx, ctx, item.id);
    }
    await deps.repo.markCancelled(tx, item.id, {
      by: ctx.userId,
      authorizedBy: authorizerUserId,
      reason,
      at: ctx.clock.now(),
    });
    if (item.kitchenTicketId) await deps.repo.cancelTicketIfEmpty(tx, item.kitchenTicketId);
    await deps.repo.bumpOrder(tx, order.id);
    await recordAuditFromContext(tx, ctx, 'ORDER_ITEM_CANCELLED', {
      entityType: 'order_item',
      entityId: item.id,
      authorizerUserId,
      before: { status: item.status },
      after: {
        order: order.number,
        product: item.productName,
        quantity: item.quantity,
        reason,
        stock: effect === 'ESTORNO' ? 'VOLTOU_AO_ESTOQUE' : 'PERDA',
      },
    });
  });
}

// ---- Conta e mesas (RN-ORD-16 a RN-ORD-20) ----

async function lockTableOrder(
  deps: OrdersDependencies,
  tx: Transaction,
  ctx: RequestContext,
  input: { orderId: Id; version: number },
) {
  const order = await lockOrder(deps, tx, ctx, input.orderId, { version: input.version });
  if (order.type !== 'MESA') throw orderErrors.notTableOrder();
  return order;
}

export async function requestBill(
  deps: OrdersDependencies,
  ctx: RequestContext,
  input: { orderId: Id; version: number },
): Promise<void> {
  requirePermission(ctx, 'orders.update');
  await runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const order = await lockTableOrder(deps, tx, ctx, input);
    const items = await deps.repo.listItems(tx, order.id, LOCK);
    if (items.some((item) => item.status === 'PENDENTE')) throw orderErrors.pendingItems();
    const tables = await deps.tables.lockOfOrder(tx, ctx.storeId, order.id);
    await changeTables(
      deps,
      tx,
      ctx,
      tables.filter((table) => table.status === 'OCUPADA'),
      'AGUARDANDO_CONTA',
      order.id,
    );
    await deps.repo.bumpOrder(tx, order.id);
  });
}

export async function transfer(
  deps: OrdersDependencies,
  ctx: RequestContext,
  input: { orderId: Id; version: number; fromTableId: Id; toTableId: Id },
): Promise<void> {
  requirePermission(ctx, 'orders.update');
  await runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const order = await lockTableOrder(deps, tx, ctx, input);
    const current = await deps.tables.lockOfOrder(tx, ctx.storeId, order.id);
    const locked = await deps.tables.lock(tx, ctx.storeId, [input.toTableId]);
    const from = current.find((table) => table.id === input.fromTableId);
    const to = locked[0];
    if (!from) throw orderErrors.concurrent();
    if (!to) throw tableErrors.notFound();
    if (!to.active || to.status !== 'LIVRE') throw orderErrors.tableNotAvailable();
    await deps.tables.setState(tx, [to.id], { status: from.status, currentOrderId: order.id });
    await deps.tables.setState(tx, [from.id], { status: 'LIVRE', currentOrderId: null });
    const label = tablesLabel([
      ...current.filter((table) => table.id !== from.id).map((table) => table.number),
      to.number,
    ]);
    await deps.repo.bumpOrder(tx, order.id, { label });
    await recordAuditFromContext(tx, ctx, 'TABLE_TRANSFERRED', {
      entityType: 'customer_order',
      entityId: order.id,
      before: { table: from.number },
      after: { table: to.number, order: order.number },
    });
  });
}

/** Traz a mesa para a conta (RN-ORD-18): livre, ou com a conta dela mesclada. */
export async function join(
  deps: OrdersDependencies,
  ctx: RequestContext,
  input: { orderId: Id; version: number; tableId: Id },
): Promise<void> {
  requirePermission(ctx, 'orders.update');
  await runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    // Conta da outra mesa (lida sem trava) para travar as DUAS contas em ordem de id (RN-ORD-22)
    const [peek] = (await deps.tables.listActive(tx, ctx.storeId)).filter(
      (table) => table.id === input.tableId,
    );
    const sourceId = peek?.currentOrderId ?? null;
    if (sourceId === input.orderId) throw orderErrors.sameOrder();
    const orders = await deps.repo.lockOrders(
      tx,
      ctx.storeId,
      sourceId ? [input.orderId, sourceId] : [input.orderId],
    );
    const target = orders.find((order) => order.id === input.orderId);
    if (!target) throw orderErrors.orderNotFound();
    if (target.version !== input.version) throw orderErrors.concurrent();
    if (target.status !== 'ABERTO') throw orderErrors.orderNotOpen();
    if (target.type !== 'MESA') throw orderErrors.notTableOrder();

    const targetTables = await deps.tables.lockOfOrder(tx, ctx.storeId, target.id);
    const [table] = await deps.tables.lock(tx, ctx.storeId, [input.tableId]);
    if (!table) throw tableErrors.notFound();
    // Mudou entre a leitura e a trava: a tela está velha
    if (table.currentOrderId !== sourceId) throw orderErrors.concurrent();
    if (!table.active || table.status === 'EM_PAGAMENTO' || table.status === 'LIMPEZA') {
      throw orderErrors.tableNotAvailable();
    }

    let moved: TableRecord[] = [table];
    let merged: { number: number; items: number } | null = null;
    if (sourceId) {
      const source = orders.find((order) => order.id === sourceId);
      if (source?.status !== 'ABERTO') throw orderErrors.concurrent();
      moved = await deps.tables.lockOfOrder(tx, ctx.storeId, source.id);
      const targetRounds = await deps.repo.listRounds(tx, target.id, LOCK);
      const sourceRounds = await deps.repo.listRounds(tx, source.id, LOCK);
      const last = targetRounds.reduce((max, round) => Math.max(max, round.number), 0);
      await deps.repo.moveRounds(
        tx,
        target.id,
        sourceRounds.map((round, index) => ({ roundId: round.id, number: last + index + 1 })),
      );
      const sourceItems = await deps.repo.listItems(tx, source.id, LOCK);
      await deps.repo.moveItems(tx, source.id, target.id);
      await deps.repo.moveTickets(tx, source.id, target.id);
      await deps.repo.closeOrderAsCancelled(tx, source.id, {
        reason: MERGED_REASON,
        mergedInto: target.id,
        by: ctx.userId,
        at: ctx.clock.now(),
      });
      merged = { number: source.number, items: sourceItems.length };
    }
    const all = [...targetTables, ...moved.filter((item) => item.id !== table.id), table];
    await changeTables(deps, tx, ctx, all, 'OCUPADA', target.id);
    await deps.repo.bumpOrder(tx, target.id, {
      label: tablesLabel([...new Set(all.map((item) => item.number))]),
    });
    await recordAuditFromContext(tx, ctx, 'ORDERS_MERGED', {
      entityType: 'customer_order',
      entityId: target.id,
      before: merged ? { order: merged.number, items: merged.items } : { table: table.number },
      after: { order: target.number, tables: all.map((item) => item.number) },
    });
  });
}

/** Tira uma mesa de uma conta com várias mesas (RN-ORD-19). */
export async function detach(
  deps: OrdersDependencies,
  ctx: RequestContext,
  input: { orderId: Id; version: number; tableId: Id },
): Promise<void> {
  requirePermission(ctx, 'orders.update');
  await runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const order = await lockTableOrder(deps, tx, ctx, input);
    const tables = await deps.tables.lockOfOrder(tx, ctx.storeId, order.id);
    const table = tables.find((item) => item.id === input.tableId);
    if (!table) throw orderErrors.concurrent();
    if (tables.length < 2) throw orderErrors.needsTable();
    await deps.tables.setState(tx, [table.id], { status: 'LIVRE', currentOrderId: null });
    const label = tablesLabel(
      tables.filter((item) => item.id !== table.id).map((item) => item.number),
    );
    await deps.repo.bumpOrder(tx, order.id, { label });
    await recordAuditFromContext(tx, ctx, 'TABLE_DETACHED', {
      entityType: 'customer_order',
      entityId: order.id,
      before: { tables: tables.map((item) => item.number) },
      after: { detached: table.number, label },
    });
  });
}

/** Conta aberta por engano, sem nada enviado (RN-ORD-20, E6-4). */
export async function cancelOrder(
  deps: OrdersDependencies,
  ctx: RequestContext,
  input: { orderId: Id; version: number; reason?: string | null },
): Promise<void> {
  requirePermission(ctx, 'orders.update');
  const reason = optionalReason(input.reason);
  await runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const order = await lockOrder(deps, tx, ctx, input.orderId, { version: input.version });
    const items = await deps.repo.listItems(tx, order.id, LOCK);
    if (items.some((item) => isSent(item.status))) throw orderErrors.hasSentItems();
    await deps.repo.deleteItems(
      tx,
      items.filter((item) => item.status === 'PENDENTE').map((item) => item.id),
    );
    await deps.repo.closeOrderAsCancelled(tx, order.id, {
      reason,
      mergedInto: null,
      by: ctx.userId,
      at: ctx.clock.now(),
    });
    if (order.type === 'MESA') {
      const tables = await deps.tables.lockOfOrder(tx, ctx.storeId, order.id);
      await deps.tables.setState(
        tx,
        tables.map((table) => table.id),
        { status: 'LIVRE', currentOrderId: null },
      );
    }
    await recordAuditFromContext(tx, ctx, 'ORDER_CANCELLED', {
      entityType: 'customer_order',
      entityId: order.id,
      after: { order: order.number, label: order.label, reason },
    });
  });
}
