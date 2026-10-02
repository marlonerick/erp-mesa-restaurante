// API pública do módulo Cashier (Etapa 8 — docs/modules/cashier.md).
import { findTerminalOfDevice, getStore, getStoreSettings } from '@/modules/organizations';
import { findUsersByIds } from '@/modules/users';
import { type Database, getDatabase } from '@/shared/db/client';
import type { Id, RequestContext } from '@/shared/kernel';
import * as useCases from './application/cashier';
import type { CashierDependencies } from './application/ports';
import { cashierRepository as repo } from './infrastructure/cashier-repository';

export type {
  CashierPort,
  CashierScreen,
  CashMovementView,
  ClosedSummary,
} from './application/cashier';
export type { CashSessionRecord } from './application/ports';
export {
  type CountLine,
  MAX_CASH_CENTS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  type PaymentMethod,
} from './domain/rules';

function cashierDependencies(overrides: { db?: Database } = {}): CashierDependencies {
  const { db } = overrides;
  return {
    get db() {
      return db ?? getDatabase().db;
    },
    repo,
    stores: {
      findStore: getStore,
      settings: getStoreSettings,
      terminalOfDevice: findTerminalOfDevice,
    },
    userNames: async (tx, ids) =>
      new Map((await findUsersByIds(tx, ids)).map((user) => [user.id, user.name])),
  };
}

/** Caixa aberto, venda e estorno para o PDV, na transação de quem chama (RN-CASH-04). */
export const cashierOps = useCases.cashierPort(cashierDependencies());

/** Casos de uso do caixa. Cashier não depende do PDV nem da comanda. */
export function cashierService(overrides: { db?: Database } = {}) {
  const deps = cashierDependencies(overrides);
  return {
    current: (ctx: RequestContext) => useCases.current(deps, ctx),
    summary: (ctx: RequestContext, sessionId: Id) => useCases.summary(deps, ctx, sessionId),
    open: (ctx: RequestContext, input: Parameters<typeof useCases.open>[2]) =>
      useCases.open(deps, ctx, input),
    movement: (ctx: RequestContext, input: Parameters<typeof useCases.movement>[2]) =>
      useCases.movement(deps, ctx, input),
    close: (ctx: RequestContext, input: Parameters<typeof useCases.close>[2]) =>
      useCases.close(deps, ctx, input),
  };
}

export type CashierService = ReturnType<typeof cashierService>;
