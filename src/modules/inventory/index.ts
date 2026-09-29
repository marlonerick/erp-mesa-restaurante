// API pública do módulo Inventory (Etapa 5 — docs/modules/inventory.md).
import { getStore, getStoreSettings } from '@/modules/organizations';
import { findUsersByIds } from '@/modules/users';
import { type Database, getDatabase } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, RequestContext } from '@/shared/kernel';
import * as useCases from './application/inventory';
import type { InventoryDependencies } from './application/ports';
import { inventoryRepository as repo } from './infrastructure/inventory-repository';

export type {
  ConsumptionLine,
  IngredientDetail,
  IngredientView,
  MovementResult,
  MovementView,
  StockShortage,
} from './application/inventory';
export type {
  ConversionRecord,
  IngredientWithStock,
  MovementLossReason,
  MovementType,
} from './application/ports';
export { BASE_UNITS, fixedUnitsFor, LOSS_REASONS, type LossReason } from './domain/rules';

/** `db` só é aberto quando um caso de uso abre transação própria (a baixa usa a de quem chama). */
function dependencies(database: () => Database): InventoryDependencies {
  return {
    get db() {
      return database();
    },
    repo,
    stores: { findStore: getStore, settings: getStoreSettings },
    userNames: async (tx, ids) =>
      new Map((await findUsersByIds(tx, ids)).map((user) => [user.id, user.name])),
  };
}

const defaultDatabase = () => getDatabase().db;

// ---- Baixa por venda (ADR-0006, opção A) — chamada pela comanda na transação dela ----

/** Consumo ao enviar a rodada: avisos (permitir) ou `INSUFFICIENT_STOCK` (bloquear). */
export function consumeStock(
  tx: Transaction,
  ctx: RequestContext,
  lines: readonly useCases.ConsumptionLine[],
) {
  return useCases.consumeStock(dependencies(defaultDatabase), tx, ctx, lines);
}

/** Item cancelado antes do preparo: volta ao estoque com o custo do consumo. */
export function reverseConsumption(tx: Transaction, ctx: RequestContext, originId: Id) {
  return useCases.reverseConsumption(dependencies(defaultDatabase), tx, ctx, originId);
}

/** Item cancelado depois do preparo: o consumo vira perda. */
export function consumptionToLoss(tx: Transaction, ctx: RequestContext, originId: Id) {
  return useCases.consumptionToLoss(dependencies(defaultDatabase), tx, ctx, originId);
}

/** CMV da loja no período de dias operacionais (centavos). */
export const costOfGoodsSold = (
  tx: Transaction,
  scope: { storeId: Id; from: string; to: string },
) => useCases.costOfGoodsSold({ repo }, tx, scope);

/** Perdas da loja no período (centavos). */
export const lossesValue = (tx: Transaction, scope: { storeId: Id; from: string; to: string }) =>
  useCases.lossesValue({ repo }, tx, scope);

/** Insumos da empresa com o custo médio na loja (ficha técnica). */
export const ingredientCosts = (tx: Transaction, scope: { companyId: Id; storeId: Id }) =>
  useCases.ingredientCosts({ repo }, tx, scope);

// ---- Telas de estoque ----

export function inventoryService(overrides: { db?: Database } = {}) {
  const { db } = overrides;
  const deps = dependencies(db ? () => db : defaultDatabase);
  type Args<F> = F extends (d: InventoryDependencies, c: RequestContext, i: infer I) => unknown
    ? I
    : never;
  const bind =
    <F extends (d: InventoryDependencies, c: RequestContext, i: never) => unknown>(fn: F) =>
    (ctx: RequestContext, input: Args<F>) =>
      fn(deps, ctx, input as never) as ReturnType<F>;
  return {
    listIngredients: (ctx: RequestContext, filter?: Args<typeof useCases.listIngredients>) =>
      useCases.listIngredients(deps, ctx, filter),
    getIngredient: bind(useCases.getIngredient),
    createIngredient: bind(useCases.createIngredient),
    updateIngredient: bind(useCases.updateIngredient),
    addConversion: bind(useCases.addConversion),
    removeConversion: bind(useCases.removeConversion),
    setMinimum: bind(useCases.setMinimum),
    registerEntry: bind(useCases.registerEntry),
    registerExit: bind(useCases.registerExit),
    registerLoss: bind(useCases.registerLoss),
    registerCount: bind(useCases.registerCount),
    /** Testes e casos de uso que já têm transação usam as mesmas dependências. */
    consumeStock: (
      tx: Transaction,
      ctx: RequestContext,
      lines: readonly useCases.ConsumptionLine[],
    ) => useCases.consumeStock(deps, tx, ctx, lines),
    reverseConsumption: (tx: Transaction, ctx: RequestContext, originId: Id) =>
      useCases.reverseConsumption(deps, tx, ctx, originId),
    consumptionToLoss: (tx: Transaction, ctx: RequestContext, originId: Id) =>
      useCases.consumptionToLoss(deps, tx, ctx, originId),
  };
}

export type InventoryService = ReturnType<typeof inventoryService>;
