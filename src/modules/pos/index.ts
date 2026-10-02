// API pública do módulo POS — PDV (Etapa 8 — docs/modules/pos.md).
import { authorizeOrElevate, getDiscountLimitInStore } from '@/modules/authorization';
import { cashierOps } from '@/modules/cashier';
import { billingOrders } from '@/modules/orders';
import { getStore } from '@/modules/organizations';
import { findUsersByIds } from '@/modules/users';
import { type Database, getDatabase } from '@/shared/db/client';
import type { Id, RequestContext } from '@/shared/kernel';
import type { PosDependencies } from './application/ports';
import * as useCases from './application/pos';
import { posRepository as repo } from './infrastructure/pos-repository';

export type { BillDetail, BillPayment, PayResult, Receivable } from './application/pos';
export type { PaymentRecord } from './application/ports';
export { type BillTotals, type DiscountMode, parsePercent, splitEvenly } from './domain/rules';

/**
 * Casos de uso do PDV. Usa Orders (conta e mesas), Cashier (caixa), Authorization (limite e PIN)
 * pela API pública de cada um, na mesma transação; nenhum deles depende do PDV.
 */
export function posService(overrides: { db?: Database } = {}) {
  const { db } = overrides;
  const deps: PosDependencies = {
    get db() {
      return db ?? getDatabase().db;
    },
    repo,
    orders: billingOrders,
    cashier: cashierOps,
    findStore: getStore,
    discountLimit: getDiscountLimitInStore,
    authorizeOrElevate,
    userNames: async (tx, ids) =>
      new Map((await findUsersByIds(tx, ids)).map((user) => [user.id, user.name])),
  };
  type Input<F> = F extends (d: PosDependencies, c: RequestContext, i: infer I) => unknown
    ? I
    : never;
  return {
    receivables: (ctx: RequestContext) => useCases.receivables(deps, ctx),
    bill: (ctx: RequestContext, orderId: Id) => useCases.bill(deps, ctx, orderId),
    myDiscountLimit: (ctx: RequestContext) => useCases.myDiscountLimit(deps, ctx),
    preBill: (ctx: RequestContext, input: Input<typeof useCases.preBill>) =>
      useCases.preBill(deps, ctx, input),
    discountOrder: (ctx: RequestContext, input: Input<typeof useCases.discountOrder>) =>
      useCases.discountOrder(deps, ctx, input),
    discountItem: (ctx: RequestContext, input: Input<typeof useCases.discountItem>) =>
      useCases.discountItem(deps, ctx, input),
    serviceFee: (ctx: RequestContext, input: Input<typeof useCases.serviceFee>) =>
      useCases.serviceFee(deps, ctx, input),
    pay: (ctx: RequestContext, input: Input<typeof useCases.pay>) => useCases.pay(deps, ctx, input),
    cancelPayment: (ctx: RequestContext, input: Input<typeof useCases.cancelPayment>) =>
      useCases.cancelPayment(deps, ctx, input),
  };
}

export type PosService = ReturnType<typeof posService>;
