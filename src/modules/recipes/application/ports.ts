import type { CostingTarget } from '@/modules/catalog';
import type { ConsumptionLine, IngredientWithStock, StockShortage } from '@/modules/inventory';
import type { StoreInfo } from '@/modules/organizations';
import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, RequestContext } from '@/shared/kernel';
import type { RecipeKind, RecipeLine } from '../domain/rules';

export interface RecipeRecord {
  readonly id: Id;
  readonly version: number;
  readonly lines: RecipeLine[];
}

/** Linha de ficha com o dono (produto OU adicional). */
export interface OwnedRecipeLine extends RecipeLine {
  readonly productId: Id | null;
  readonly modifierId: Id | null;
}

export interface RecipesRepository {
  /** Ficha de um produto/adicional DA EMPRESA; `forUpdate` trava para salvar. */
  findRecipe(
    tx: Transaction,
    scope: { companyId: Id; kind: RecipeKind; targetId: Id },
    options?: { forUpdate?: boolean },
  ): Promise<RecipeRecord | null>;
  /** Linhas das fichas da empresa (todas, ou só destes produtos/adicionais). */
  listLines(
    tx: Transaction,
    scope: { companyId: Id; productIds?: readonly Id[]; modifierIds?: readonly Id[] },
  ): Promise<OwnedRecipeLine[]>;
  /** Versões das fichas da empresa (produto/adicional → versão). */
  listRecipeOwners(
    tx: Transaction,
    companyId: Id,
  ): Promise<{ productId: Id | null; modifierId: Id | null }[]>;
  insertRecipe(
    tx: Transaction,
    input: { id: Id; companyId: Id; kind: RecipeKind; targetId: Id; updatedBy: Id },
  ): Promise<void>;
  /** Sobe a versão se ainda for `version`; false = outra pessoa salvou antes (ADR-0008). */
  bumpRecipe(tx: Transaction, id: Id, version: number, updatedBy: Id): Promise<boolean>;
  replaceLines(tx: Transaction, recipeId: Id, lines: readonly RecipeLine[]): Promise<void>;
}

/** O que a ficha usa de outros módulos (Catalog, Inventory, Organizations). */
export interface RecipesDependencies {
  readonly db: Database;
  readonly repo: RecipesRepository;
  readonly findStore: (tx: Transaction, storeId: Id) => Promise<StoreInfo | null>;
  readonly costingTargets: (
    tx: Transaction,
    scope: { companyId: Id; storeId: Id },
  ) => Promise<{ products: CostingTarget[]; modifiers: CostingTarget[] }>;
  readonly ingredientCosts: (
    tx: Transaction,
    scope: { companyId: Id; storeId: Id },
  ) => Promise<IngredientWithStock[]>;
  readonly consumeStock: (
    tx: Transaction,
    ctx: RequestContext,
    lines: readonly ConsumptionLine[],
  ) => Promise<StockShortage[]>;
}
