import { recordAuditFromContext } from '@/modules/audit';
import type { CostingTarget } from '@/modules/catalog';
import type { IngredientWithStock, StockShortage } from '@/modules/inventory';
import type { StoreInfo } from '@/modules/organizations';
import { MYSQL_ERRNO, mysqlErrno } from '@/shared/db/mysql-errors';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import {
  type BaseUnit,
  DomainError,
  formatQuantityText,
  type Id,
  newId,
  Quantity,
  type RequestContext,
  requirePermission,
  totalCost,
  UnitCost,
} from '@/shared/kernel';
import {
  expandConsumption,
  marginTenths,
  type RecipeKind,
  type RecipeLine,
  type RecipeLineInput,
  sameLines,
  validateLines,
} from '../domain/rules';
import type { OwnedRecipeLine, RecipesDependencies } from './ports';

// ---- Erros (docs/modules/recipes.md §4) ----

const errors = {
  storeNotFound: () => new DomainError('STORE_NOT_FOUND', 'Loja não encontrada.', 'NOT_FOUND'),
  targetNotFound: (kind: RecipeKind) =>
    kind === 'PRODUCT'
      ? new DomainError('PRODUCT_NOT_FOUND', 'Produto não encontrado.', 'NOT_FOUND')
      : new DomainError('MODIFIER_NOT_FOUND', 'Adicional não encontrado.', 'NOT_FOUND'),
  ingredientNotFound: () =>
    new DomainError('INGREDIENT_NOT_FOUND', 'Insumo não encontrado.', 'NOT_FOUND'),
  ingredientInactive: (name: string) =>
    new DomainError('INGREDIENT_INACTIVE', `O insumo ${name} está desativado.`, 'BUSINESS_RULE'),
  concurrent: () =>
    new DomainError(
      'CONCURRENT_MODIFICATION',
      'Outra pessoa alterou estes dados. Recarregue a página e tente de novo.',
      'CONFLICT',
    ),
};

async function activeStore(
  deps: RecipesDependencies,
  tx: Transaction,
  ctx: RequestContext,
): Promise<StoreInfo> {
  const found = await deps.findStore(tx, ctx.storeId);
  if (found?.organizationId !== ctx.organizationId) throw errors.storeNotFound();
  return found;
}

// ---- Custo (RN-REC-04) ----

/** Custo teórico de uma lista de linhas, com o custo médio da loja (centavos, arredonda uma vez). */
function costOf(lines: readonly RecipeLine[], costs: ReadonlyMap<Id, IngredientWithStock>): number {
  return totalCost(
    lines.flatMap((line) => {
      const ingredient = costs.get(line.ingredientId);
      return ingredient
        ? [
            {
              quantity: Quantity.fromThousandths(line.quantity, ingredient.baseUnit),
              unitCost: UnitCost.fromMicros(ingredient.avgCostMicros),
            },
          ]
        : [];
    }),
  ).cents;
}

export interface RecipeSummary {
  readonly kind: RecipeKind;
  readonly id: Id;
  readonly name: string;
  /** Categoria (produto) ou grupo (adicional). */
  readonly groupName: string;
  readonly active: boolean;
  readonly hasRecipe: boolean;
  readonly costCents: number;
  /** Produto: preço na loja; adicional: preço extra. null = não vendido na loja. */
  readonly priceCents: number | null;
  /** Décimos de ponto percentual (788 = 78,8%). */
  readonly marginTenths: number | null;
}

function summarize(
  kind: RecipeKind,
  target: CostingTarget,
  lines: readonly RecipeLine[],
  costs: ReadonlyMap<Id, IngredientWithStock>,
  hasRecipe: boolean,
): RecipeSummary {
  const costCents = costOf(lines, costs);
  return {
    kind,
    id: target.id,
    name: target.name,
    groupName: target.groupName,
    active: target.active,
    hasRecipe,
    costCents,
    priceCents: target.priceCents,
    marginTenths: hasRecipe ? marginTenths(target.priceCents, costCents) : null,
  };
}

const linesOf = (rows: readonly OwnedRecipeLine[], kind: RecipeKind, id: Id) =>
  rows.filter((row) => (kind === 'PRODUCT' ? row.productId : row.modifierId) === id);

/** Produtos e adicionais da empresa com custo teórico e margem na loja ativa. */
export async function listRecipes(
  deps: RecipesDependencies,
  ctx: RequestContext,
): Promise<{ products: RecipeSummary[]; modifiers: RecipeSummary[] }> {
  requirePermission(ctx, 'recipes.read');
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const scope = { companyId, storeId: ctx.storeId };
    const targets = await deps.costingTargets(tx, scope);
    const costs = new Map((await deps.ingredientCosts(tx, scope)).map((item) => [item.id, item]));
    const lines = await deps.repo.listLines(tx, { companyId });
    const owners = await deps.repo.listRecipeOwners(tx, companyId);
    const withRecipe = new Set(owners.flatMap((row) => [row.productId, row.modifierId]));
    return {
      products: targets.products.map((item) =>
        summarize(
          'PRODUCT',
          item,
          linesOf(lines, 'PRODUCT', item.id),
          costs,
          withRecipe.has(item.id),
        ),
      ),
      modifiers: targets.modifiers.map((item) =>
        summarize(
          'MODIFIER',
          item,
          linesOf(lines, 'MODIFIER', item.id),
          costs,
          withRecipe.has(item.id),
        ),
      ),
    };
  });
}

export interface RecipeLineView {
  readonly ingredientId: Id;
  readonly name: string;
  readonly baseUnit: BaseUnit;
  readonly quantity: number;
  readonly lineCostCents: number;
}

export interface RecipeDetail extends RecipeSummary {
  /** null = ainda sem ficha (a tela manda `null` ao salvar a primeira vez). */
  readonly version: number | null;
  readonly lines: RecipeLineView[];
  /** Insumos ATIVOS que podem entrar na ficha. */
  readonly ingredients: { id: Id; name: string; baseUnit: BaseUnit }[];
}

export async function getRecipe(
  deps: RecipesDependencies,
  ctx: RequestContext,
  input: { kind: RecipeKind; id: Id },
): Promise<RecipeDetail> {
  requirePermission(ctx, 'recipes.read');
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const scope = { companyId, storeId: ctx.storeId };
    const targets = await deps.costingTargets(tx, scope);
    const target = (input.kind === 'PRODUCT' ? targets.products : targets.modifiers).find(
      (item) => item.id === input.id,
    );
    if (!target) throw errors.targetNotFound(input.kind);
    const all = await deps.ingredientCosts(tx, scope);
    const costs = new Map(all.map((item) => [item.id, item]));
    const recipe = await deps.repo.findRecipe(tx, {
      companyId,
      kind: input.kind,
      targetId: target.id,
    });
    const lines = recipe?.lines ?? [];
    return {
      ...summarize(input.kind, target, lines, costs, recipe !== null),
      version: recipe?.version ?? null,
      lines: lines.flatMap((line) => {
        const ingredient = costs.get(line.ingredientId);
        return ingredient
          ? [
              {
                ingredientId: line.ingredientId,
                name: ingredient.name,
                baseUnit: ingredient.baseUnit,
                quantity: line.quantity,
                lineCostCents: costOf([line], costs),
              },
            ]
          : [];
      }),
      ingredients: all
        .filter((item) => item.active)
        .map((item) => ({ id: item.id, name: item.name, baseUnit: item.baseUnit })),
    };
  });
}

/**
 * Salva a ficha inteira (RN-REC-02, RN-REC-03). `version: null` = a tela mostrava "sem ficha": se
 * outra pessoa criou antes, é conflito. Vale daqui para frente (RN-REC-05).
 */
export async function saveRecipe(
  deps: RecipesDependencies,
  ctx: RequestContext,
  input: { kind: RecipeKind; id: Id; version: number | null; lines: readonly RecipeLineInput[] },
): Promise<void> {
  requirePermission(ctx, 'recipes.manage');
  const lines = validateLines(input.lines);
  try {
    await runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      const scope = { companyId, storeId: ctx.storeId };
      const targets = await deps.costingTargets(tx, scope);
      const target = (input.kind === 'PRODUCT' ? targets.products : targets.modifiers).find(
        (item) => item.id === input.id,
      );
      if (!target) throw errors.targetNotFound(input.kind);

      const ingredients = new Map(
        (await deps.ingredientCosts(tx, scope)).map((item) => [item.id, item]),
      );
      const current = await deps.repo.findRecipe(
        tx,
        { companyId, kind: input.kind, targetId: target.id },
        { forUpdate: true },
      );
      if ((current?.version ?? null) !== input.version) throw errors.concurrent();
      const kept = new Set(current?.lines.map((line) => line.ingredientId));
      for (const line of lines) {
        const ingredient = ingredients.get(line.ingredientId);
        if (!ingredient) throw errors.ingredientNotFound();
        // Insumo desativado não entra; o que já estava na ficha pode continuar (RN-INV-02)
        if (!ingredient.active && !kept.has(line.ingredientId)) {
          throw errors.ingredientInactive(ingredient.name);
        }
      }
      if (current && sameLines(current.lines, lines)) return;

      let recipeId: Id;
      if (current) {
        if (!(await deps.repo.bumpRecipe(tx, current.id, current.version, ctx.userId))) {
          throw errors.concurrent();
        }
        recipeId = current.id;
      } else {
        recipeId = newId();
        await deps.repo.insertRecipe(tx, {
          id: recipeId,
          companyId,
          kind: input.kind,
          targetId: target.id,
          updatedBy: ctx.userId,
        });
      }
      await deps.repo.replaceLines(tx, recipeId, lines);
      const describe = (items: readonly RecipeLine[]) =>
        items.map((line) => ({
          ingredient: ingredients.get(line.ingredientId)?.name ?? line.ingredientId,
          quantity: formatQuantityText(line.quantity),
        }));
      await recordAuditFromContext(tx, ctx, 'RECIPE_UPDATED', {
        storeId: null, // ficha da empresa: vale para todas as lojas
        entityType: input.kind === 'PRODUCT' ? 'product' : 'modifier',
        entityId: target.id,
        before: { lines: describe(current?.lines ?? []) },
        after: { lines: describe(lines) },
      });
    });
  } catch (error) {
    // Duas "primeiras fichas" ao mesmo tempo: o índice único decide, a outra recarrega
    if (mysqlErrno(error) === MYSQL_ERRNO.DUPLICATE_ENTRY) throw errors.concurrent();
    throw error;
  }
}

// ---- Consumo de itens vendidos (RN-REC-06) — API pública para a comanda (Etapa 6) ----

export interface ItemToConsume {
  /** Item do pedido. */
  readonly originId: Id;
  readonly productId: Id;
  /** Quantidade vendida em milésimos (1 un = 1000). */
  readonly quantity: number;
  readonly modifiers: readonly { readonly modifierId: Id; readonly quantity: number }[];
}

/** Quanto de cada insumo os itens consomem (itens sem ficha não consomem nada). */
export async function consumptionForItems(
  deps: Pick<RecipesDependencies, 'repo'>,
  tx: Transaction,
  companyId: Id,
  items: readonly ItemToConsume[],
) {
  const productIds = [...new Set(items.map((item) => item.productId))];
  const modifierIds = [
    ...new Set(items.flatMap((item) => item.modifiers.map((extra) => extra.modifierId))),
  ];
  const rows = await deps.repo.listLines(tx, { companyId, productIds, modifierIds });
  return expandConsumption(
    items.map((item) => ({
      originId: item.originId,
      quantity: item.quantity,
      productLines: linesOf(rows, 'PRODUCT', item.productId),
      modifiers: item.modifiers.map((extra) => ({
        quantity: extra.quantity,
        lines: linesOf(rows, 'MODIFIER', extra.modifierId),
      })),
    })),
  );
}

/**
 * Baixa de estoque dos itens enviados para a cozinha (ADR-0006 A), na transação de quem chama.
 * Com BLOQUEAR, falta recusa tudo (`INSUFFICIENT_STOCK`); senão, devolve os avisos.
 */
export async function consumeForItems(
  deps: RecipesDependencies,
  tx: Transaction,
  ctx: RequestContext,
  items: readonly ItemToConsume[],
): Promise<StockShortage[]> {
  const { companyId } = await activeStore(deps, tx, ctx);
  const lines = await consumptionForItems(deps, tx, companyId, items);
  return deps.consumeStock(tx, ctx, lines);
}
