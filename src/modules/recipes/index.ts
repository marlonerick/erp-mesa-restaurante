// API pública do módulo Recipes (Etapa 5 — docs/modules/recipes.md).
import { listCostingTargets } from '@/modules/catalog';
import { consumeStock, ingredientCosts } from '@/modules/inventory';
import { getStore } from '@/modules/organizations';
import { type Database, getDatabase } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, RequestContext } from '@/shared/kernel';
import * as useCases from './application/recipes';
import type { RecipesDependencies } from './application/ports';
import { recipesRepository as repo } from './infrastructure/recipes-repository';

export type {
  ItemToConsume,
  RecipeDetail,
  RecipeLineView,
  RecipeSummary,
} from './application/recipes';
export { MAX_RECIPE_LINES, type RecipeKind } from './domain/rules';

const defaultDatabase = () => getDatabase().db;

/** `db` só é aberto quando um caso de uso abre transação própria. */
function dependencies(database: () => Database): RecipesDependencies {
  return {
    get db() {
      return database();
    },
    repo,
    findStore: getStore,
    costingTargets: listCostingTargets,
    ingredientCosts,
    consumeStock,
  };
}

/** Quanto de cada insumo os itens consomem (sem gravar nada). */
export const consumptionForItems = (
  tx: Transaction,
  companyId: Id,
  items: readonly useCases.ItemToConsume[],
) => useCases.consumptionForItems({ repo }, tx, companyId, items);

/** Baixa de estoque dos itens enviados para a cozinha (ADR-0006 A) — chamada pela comanda. */
export const consumeForItems = (
  tx: Transaction,
  ctx: RequestContext,
  items: readonly useCases.ItemToConsume[],
) => useCases.consumeForItems(dependencies(defaultDatabase), tx, ctx, items);

export function recipesService(overrides: { db?: Database } = {}) {
  const { db } = overrides;
  const deps = dependencies(db ? () => db : defaultDatabase);
  return {
    listRecipes: (ctx: RequestContext) => useCases.listRecipes(deps, ctx),
    getRecipe: (ctx: RequestContext, input: Parameters<typeof useCases.getRecipe>[2]) =>
      useCases.getRecipe(deps, ctx, input),
    saveRecipe: (ctx: RequestContext, input: Parameters<typeof useCases.saveRecipe>[2]) =>
      useCases.saveRecipe(deps, ctx, input),
    consumeForItems: (
      tx: Transaction,
      ctx: RequestContext,
      items: readonly useCases.ItemToConsume[],
    ) => useCases.consumeForItems(deps, tx, ctx, items),
  };
}

export type RecipesService = ReturnType<typeof recipesService>;
