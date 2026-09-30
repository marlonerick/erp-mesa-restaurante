// API pública do módulo Kitchen (Etapa 7 — docs/modules/kitchen.md).
import { kitchenOrders } from '@/modules/orders';
import { getDefaultStation, getStore, getStoreSettings } from '@/modules/organizations';
import { findUsersByIds } from '@/modules/users';
import { type Database, getDatabase } from '@/shared/db/client';
import type { Id, RequestContext } from '@/shared/kernel';
import * as useCases from './application/kitchen';
import type { KitchenDependencies } from './application/ports';

export type { BoardTicket, KitchenBoard } from './application/kitchen';
export {
  ALERT_LABEL,
  type AlertLevel,
  alertLevel,
  CANCELLED_VISIBLE_SECONDS,
  formatElapsed,
  RECENT_READY_MINUTES,
} from './domain/rules';

/** Casos de uso da cozinha. Tickets e itens vêm do Orders (sem ciclo: Orders não usa Kitchen). */
export function kitchenService(overrides: { db?: Database } = {}) {
  const { db } = overrides;
  const deps: KitchenDependencies = {
    get db() {
      return db ?? getDatabase().db;
    },
    orders: kitchenOrders,
    stores: { findStore: getStore, settings: getStoreSettings, defaultStation: getDefaultStation },
    userNames: async (tx, ids) =>
      new Map((await findUsersByIds(tx, ids)).map((user) => [user.id, user.name])),
  };
  return {
    board: (ctx: RequestContext) => useCases.board(deps, ctx),
    startItem: (ctx: RequestContext, input: { itemId: Id }) => useCases.startItem(deps, ctx, input),
    readyItem: (ctx: RequestContext, input: { itemId: Id }) => useCases.readyItem(deps, ctx, input),
    readyTicket: (ctx: RequestContext, input: { ticketId: Id }) =>
      useCases.readyTicket(deps, ctx, input),
    undoReady: (ctx: RequestContext, input: { itemId: Id }) => useCases.undoReady(deps, ctx, input),
  };
}

export type KitchenService = ReturnType<typeof kitchenService>;
