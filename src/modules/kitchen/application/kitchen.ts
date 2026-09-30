import { recordAuditFromContext } from '@/modules/audit';
import type { KitchenItemRecord, KitchenTicketRecord } from '@/modules/orders';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import { DomainError, type Id, type RequestContext, requirePermission } from '@/shared/kernel';
import {
  CANCELLED_VISIBLE_SECONDS,
  kitchenErrors,
  kitchenTransition,
  RECENT_READY_LIMIT,
  RECENT_READY_MINUTES,
} from '../domain/rules';
import type { KitchenDependencies } from './ports';

const storeNotFound = () => new DomainError('STORE_NOT_FOUND', 'Loja não encontrada.', 'NOT_FOUND');

async function activeStore(deps: KitchenDependencies, tx: Transaction, ctx: RequestContext) {
  const found = await deps.stores.findStore(tx, ctx.storeId);
  if (found?.organizationId !== ctx.organizationId) throw storeNotFound();
  return found;
}

// ---- Leitura (RN-KDS-02, RN-KDS-08 a RN-KDS-11) ----

export interface BoardTicket extends KitchenTicketRecord {
  readonly sentByName: string | null;
  readonly items: KitchenItemRecord[];
}

export interface KitchenBoard {
  /** Hora do servidor: o tablet corrige o próprio relógio com ela (RN-KDS-09). */
  readonly serverNow: Date;
  readonly station: { readonly id: Id; readonly name: string };
  readonly warningMinutes: number;
  readonly lateMinutes: number;
  /** Fila: NOVO e EM_PREPARO, do mais antigo para o mais novo. */
  readonly queue: BoardTicket[];
  /** Tickets todos cancelados há menos de 30 s (aparecem riscados). */
  readonly cancelled: BoardTicket[];
  /** Prontos nos últimos 15 minutos, o mais recente primeiro. */
  readonly recent: BoardTicket[];
}

/** A tela da cozinha: a fila completa da estação padrão da loja ativa. */
export async function board(deps: KitchenDependencies, ctx: RequestContext): Promise<KitchenBoard> {
  requirePermission(ctx, 'kds.read');
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const settings = await deps.stores.settings(tx, {
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
    });
    const station = await deps.stores.defaultStation(tx, ctx.storeId);
    if (!settings || !station) throw storeNotFound();
    const now = ctx.clock.now();
    const scope = { storeId: ctx.storeId, stationId: station.id };
    const queue = await deps.orders.listQueue(tx, scope);
    const cancelled = await deps.orders.listFinished(tx, scope, {
      status: 'CANCELADO',
      since: new Date(now.getTime() - CANCELLED_VISIBLE_SECONDS * 1000),
      limit: 20,
    });
    const recent = await deps.orders.listFinished(tx, scope, {
      status: 'PRONTO',
      since: new Date(now.getTime() - RECENT_READY_MINUTES * 60_000),
      limit: RECENT_READY_LIMIT,
    });
    const all = [...queue, ...cancelled, ...recent];
    const items = await deps.orders.listTicketItems(
      tx,
      all.map((ticket) => ticket.id),
    );
    const names = await deps.userNames(tx, [...new Set(all.map((ticket) => ticket.sentBy))]);
    const withItems = (ticket: KitchenTicketRecord): BoardTicket => ({
      ...ticket,
      sentByName: names.get(ticket.sentBy) ?? null,
      items: items.filter((item) => item.kitchenTicketId === ticket.id),
    });
    return {
      serverNow: now,
      station,
      warningMinutes: settings.kdsWarningMinutes,
      lateMinutes: settings.kdsLateMinutes,
      queue: queue.map(withItems),
      cancelled: cancelled.map(withItems),
      recent: recent.map(withItems),
    };
  });
}

// ---- Ações (RN-KDS-03 a RN-KDS-07, RN-KDS-12) ----

/** Iniciar: ENVIADO → EM_PREPARO. `changed: false` = outro tablet já tinha feito. */
export async function startItem(
  deps: KitchenDependencies,
  ctx: RequestContext,
  input: { itemId: Id },
): Promise<{ changed: boolean }> {
  requirePermission(ctx, 'kds.manage');
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const item = await deps.orders.lockItem(tx, ctx.storeId, input.itemId);
    if (kitchenTransition('INICIAR', item) === 'NADA') return { changed: false };
    const at = ctx.clock.now();
    await deps.orders.startItems(tx, [item.id], { by: ctx.userId, at });
    await refresh(deps, tx, item, at);
    return { changed: true };
  });
}

/** Pronto: ENVIADO/EM_PREPARO → PRONTO, mesmo sem ter iniciado. */
export async function readyItem(
  deps: KitchenDependencies,
  ctx: RequestContext,
  input: { itemId: Id },
): Promise<{ changed: boolean }> {
  requirePermission(ctx, 'kds.manage');
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const item = await deps.orders.lockItem(tx, ctx.storeId, input.itemId);
    if (kitchenTransition('PRONTO', item) === 'NADA') return { changed: false };
    const at = ctx.clock.now();
    await deps.orders.readyItems(tx, [item.id], { by: ctx.userId, at });
    await refresh(deps, tx, item, at);
    return { changed: true };
  });
}

/** Tudo pronto (Q-14): os itens ainda na cozinha ficam PRONTO de uma vez. */
export async function readyTicket(
  deps: KitchenDependencies,
  ctx: RequestContext,
  input: { ticketId: Id },
): Promise<{ changed: number }> {
  requirePermission(ctx, 'kds.manage');
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const locked = await deps.orders.lockTicket(tx, ctx.storeId, input.ticketId);
    if (!locked) throw kitchenErrors.ticketNotFound();
    const pending = locked.items.filter(
      (item) => item.status === 'ENVIADO' || item.status === 'EM_PREPARO',
    );
    if (pending.length === 0) return { changed: 0 };
    const at = ctx.clock.now();
    await deps.orders.readyItems(
      tx,
      pending.map((item) => item.id),
      { by: ctx.userId, at },
    );
    await deps.orders.refreshTicket(tx, locked.ticket.id, at);
    return { changed: pending.length };
  });
}

/** Desfazer pronto (E7-2): PRONTO → EM_PREPARO, se o garçom ainda não entregou. Auditado. */
export async function undoReady(
  deps: KitchenDependencies,
  ctx: RequestContext,
  input: { itemId: Id },
): Promise<{ changed: boolean }> {
  requirePermission(ctx, 'kds.manage');
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const item = await deps.orders.lockItem(tx, ctx.storeId, input.itemId);
    if (kitchenTransition('DESFAZER', item) === 'NADA') return { changed: false };
    const at = ctx.clock.now();
    await deps.orders.undoReady(tx, item.id, { startedAt: item.startedAt ?? at });
    await refresh(deps, tx, item, at);
    await recordAuditFromContext(tx, ctx, 'KITCHEN_READY_UNDONE', {
      entityType: 'order_item',
      entityId: item.id,
      before: { status: 'PRONTO', readyAt: item.readyAt?.toISOString() ?? null },
      after: { status: 'EM_PREPARO', product: item.productName, quantity: item.quantity },
    });
    return { changed: true };
  });
}

async function refresh(
  deps: KitchenDependencies,
  tx: Transaction,
  item: KitchenItemRecord,
  at: Date,
) {
  if (item.kitchenTicketId) await deps.orders.refreshTicket(tx, item.kitchenTicketId, at);
}
