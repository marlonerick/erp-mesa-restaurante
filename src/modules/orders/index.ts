// API pública do módulo Orders (Etapa 6 — docs/modules/orders.md).
import { authorizeOrElevate } from '@/modules/authorization';
import { listStoreMenu } from '@/modules/catalog';
import { consumptionToLoss, reverseConsumption } from '@/modules/inventory';
import { getDefaultStation, getStore, getStoreSettings } from '@/modules/organizations';
import { consumeForItems } from '@/modules/recipes';
import { listActiveTables, lockTables, lockTablesOfOrder, setTablesState } from '@/modules/tables';
import { findUsersByIds } from '@/modules/users';
import { type Database, getDatabase } from '@/shared/db/client';
import type { RequestContext } from '@/shared/kernel';
import * as useCases from './application/orders';
import type { OrdersDependencies } from './application/ports';
import { ordersRepository as repo } from './infrastructure/orders-repository';

export type {
  Floor,
  FloorTable,
  OrderDetail,
  OrderItemView,
  RoundView,
  SendResult,
} from './application/orders';
export type { OpenOrderSummary } from './application/ports';
export {
  ITEM_NOTES_MAX_LENGTH,
  ITEM_STATUS_LABEL,
  MAX_ITEM_QUANTITY,
  type OrderItemStatus,
} from './domain/rules';

/**
 * Casos de uso da comanda. Os módulos usados (mesas, cardápio, ficha técnica, estoque, lojas,
 * autorização) não dependem de Orders: sem ciclo (maps/modules/dependencias.md).
 */
export function ordersService(overrides: { db?: Database } = {}) {
  const { db } = overrides;
  const deps: OrdersDependencies = {
    get db() {
      return db ?? getDatabase().db;
    },
    repo,
    stores: { findStore: getStore, settings: getStoreSettings, defaultStation: getDefaultStation },
    tables: {
      listActive: listActiveTables,
      lock: lockTables,
      lockOfOrder: lockTablesOfOrder,
      setState: setTablesState,
    },
    menu: listStoreMenu,
    stock: { consumeForItems, reverse: reverseConsumption, toLoss: consumptionToLoss },
    authorizeOrElevate,
    userNames: async (tx, ids) =>
      new Map((await findUsersByIds(tx, ids)).map((user) => [user.id, user.name])),
  };
  type Args<F> = F extends (d: OrdersDependencies, c: RequestContext, i: infer I) => unknown
    ? I
    : never;
  const bind =
    <F extends (d: OrdersDependencies, c: RequestContext, i: never) => unknown>(fn: F) =>
    (ctx: RequestContext, input: Args<F>) =>
      fn(deps, ctx, input as never) as ReturnType<F>;
  return {
    floor: (ctx: RequestContext) => useCases.floor(deps, ctx),
    getOrder: bind(useCases.getOrder),
    menu: (ctx: RequestContext) => useCases.menu(deps, ctx),
    openTable: bind(useCases.openTable),
    openCounter: bind(useCases.openCounter),
    addItem: bind(useCases.addItem),
    removeItem: bind(useCases.removeItem),
    sendRound: bind(useCases.sendRound),
    deliverItem: bind(useCases.deliverItem),
    cancelItem: bind(useCases.cancelItem),
    requestBill: bind(useCases.requestBill),
    transfer: bind(useCases.transfer),
    join: bind(useCases.join),
    detach: bind(useCases.detach),
    cancelOrder: bind(useCases.cancelOrder),
  };
}

export type OrdersService = ReturnType<typeof ordersService>;
