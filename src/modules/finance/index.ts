// API pública do módulo Finance (Etapa 9 — docs/modules/finance.md).
import { getStore, getStoreSettings } from '@/modules/organizations';
import { findUsersByIds } from '@/modules/users';
import { type Database, getDatabase } from '@/shared/db/client';
import { operationalDate, type RequestContext } from '@/shared/kernel';
import * as useCases from './application/finance';
import type { FinanceDependencies } from './application/ports';
import { financeRepository as repo } from './infrastructure/finance-repository';

export type { CashFlow, EntriesPage, FinancePort, NewEntryInput } from './application/finance';
export type { CategoryRecord, EntryRecord } from './application/ports';
export {
  FINANCE_STATUS_LABEL,
  FINANCE_TYPE_LABEL,
  FINANCE_TYPES,
  type FinanceStatus,
  type FinanceType,
} from './domain/rules';

function financeDependencies(overrides: { db?: Database } = {}): FinanceDependencies {
  const { db } = overrides;
  return {
    get db() {
      return db ?? getDatabase().db;
    },
    repo,
    findStore: getStore,
    async today(tx, scope, now) {
      const settings = await getStoreSettings(tx, scope);
      if (!settings) throw useCases.financeErrors.storeNotFound();
      return operationalDate(now, settings.timezone, settings.operationalDayCutoff);
    },
    userNames: async (tx, ids) =>
      new Map((await findUsersByIds(tx, ids)).map((user) => [user.id, user.name])),
  };
}

/** Receitas automáticas do fechamento do caixa (RN-FIN-03), na transação de quem chama. */
export const financeOps = useCases.financePort(financeDependencies());

/** Casos de uso do financeiro. Finance não depende do caixa nem do PDV. */
export function financeService(overrides: { db?: Database } = {}) {
  const deps = financeDependencies(overrides);
  type Input<F> = F extends (d: FinanceDependencies, c: RequestContext, i: infer I) => unknown
    ? I
    : never;
  return {
    categories: (ctx: RequestContext) => useCases.categories(deps, ctx),
    createCategory: (ctx: RequestContext, input: Input<typeof useCases.createCategory>) =>
      useCases.createCategory(deps, ctx, input),
    setCategoryActive: (ctx: RequestContext, input: Input<typeof useCases.setCategoryActive>) =>
      useCases.setCategoryActive(deps, ctx, input),
    entries: (ctx: RequestContext, input: Input<typeof useCases.entries>) =>
      useCases.entries(deps, ctx, input),
    createEntry: (ctx: RequestContext, input: Input<typeof useCases.createEntry>) =>
      useCases.createEntry(deps, ctx, input),
    payEntry: (ctx: RequestContext, input: Input<typeof useCases.payEntry>) =>
      useCases.payEntry(deps, ctx, input),
    cancelEntry: (ctx: RequestContext, input: Input<typeof useCases.cancelEntry>) =>
      useCases.cancelEntry(deps, ctx, input),
    cashFlow: (ctx: RequestContext, input: Input<typeof useCases.cashFlow>) =>
      useCases.cashFlow(deps, ctx, input),
  };
}

export type FinanceService = ReturnType<typeof financeService>;
