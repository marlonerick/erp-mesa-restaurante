// API pública do módulo Catalog (Etapa 4 — docs/modules/catalog.md).
import { storeAccess } from '@/modules/authorization';
import { getStore, listStores } from '@/modules/organizations';
import { type Database, getDatabase } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, RequestContext } from '@/shared/kernel';
import * as useCases from './application/catalog';
import type { CatalogDependencies } from './application/ports';
import { catalogRepository as repo } from './infrastructure/catalog-repository';

export type {
  AvailabilityCategory,
  CategoryView,
  MenuModifierGroup,
  MenuOption,
  MenuProduct,
  ModifierGroupView,
  ProductView,
  StorePriceView,
} from './application/catalog';
export type {
  CategoryRecord,
  MenuRow,
  ModifierRecord,
  ProductListRow,
  ProductStoreRecord,
} from './application/ports';
export {
  DESCRIPTION_MAX_LENGTH,
  MAX_MODIFIER_GROUPS_PER_PRODUCT,
  MAX_SELECT_LIMIT,
  type MoveDirection,
  parseModifierPriceText,
  parsePriceText,
  PRODUCT_LIST_LIMIT,
} from './domain/rules';

/** Cardápio vendável da loja agora (RN-CAT-10) — a comanda da Etapa 6 lança a partir dele. */
export function listStoreMenu(
  tx: Transaction,
  scope: { companyId: Id; storeId: Id },
): Promise<useCases.MenuProduct[]> {
  return useCases.storeMenu({ repo }, tx, scope);
}

/** Produto ou adicional para a ficha técnica (Recipes): nome, situação e preço na loja. */
export interface CostingTarget {
  readonly id: Id;
  readonly name: string;
  /** Categoria (produto) ou grupo (adicional). */
  readonly groupName: string;
  readonly active: boolean;
  /** Produto: preço na loja (null = não vendido nela). Adicional: preço extra. */
  readonly priceCents: number | null;
}

/** Produtos e adicionais da empresa, com preço na loja — ficha técnica (Etapa 5). */
export async function listCostingTargets(
  tx: Transaction,
  scope: { companyId: Id; storeId: Id },
): Promise<{ products: CostingTarget[]; modifiers: CostingTarget[] }> {
  const products = await repo.listProducts(tx, {
    ...scope,
    search: null,
    categoryId: null,
    includeInactive: true,
  });
  const modifiers = await repo.listCompanyModifiers(tx, scope.companyId);
  return {
    products: products.map((item) => ({
      id: item.id,
      name: item.name,
      groupName: item.categoryName,
      active: item.active && item.categoryActive,
      priceCents: item.priceCents,
    })),
    modifiers: modifiers.map((item) => ({
      id: item.id,
      name: item.name,
      groupName: item.groupName,
      active: item.active && item.groupActive,
      priceCents: item.priceDeltaCents,
    })),
  };
}

/**
 * Casos de uso do cardápio. As lojas vêm do Organizations e a consulta de permissão por loja do
 * Authorization — nenhum dos dois depende do Catalog, então não há ciclo (maps/modules/dependencias.md).
 */
export function catalogService(overrides: { db?: Database } = {}) {
  const deps: CatalogDependencies = {
    db: overrides.db ?? getDatabase().db,
    repo,
    stores: { findStore: getStore, listStores },
    access: storeAccess,
  };
  type Args<F> = F extends (d: CatalogDependencies, c: RequestContext, i: infer I) => unknown
    ? I
    : never;
  const bind =
    <F extends (d: CatalogDependencies, c: RequestContext, i: never) => unknown>(fn: F) =>
    (ctx: RequestContext, input: Args<F>) =>
      fn(deps, ctx, input as never) as ReturnType<F>;
  return {
    listCategories: (ctx: RequestContext) => useCases.listCategories(deps, ctx),
    getCategory: bind(useCases.getCategory),
    createCategory: bind(useCases.createCategory),
    updateCategory: bind(useCases.updateCategory),
    moveCategory: bind(useCases.moveCategory),
    listProducts: (ctx: RequestContext, filter?: Args<typeof useCases.listProducts>) =>
      useCases.listProducts(deps, ctx, filter),
    getProduct: bind(useCases.getProduct),
    createProduct: bind(useCases.createProduct),
    updateProduct: bind(useCases.updateProduct),
    setProductStatus: bind(useCases.setProductStatus),
    setStorePrice: bind(useCases.setStorePrice),
    removeFromStore: bind(useCases.removeFromStore),
    listAvailability: (ctx: RequestContext) => useCases.listAvailability(deps, ctx),
    setAvailability: bind(useCases.setAvailability),
    listModifierGroups: (ctx: RequestContext) => useCases.listModifierGroups(deps, ctx),
    getModifierGroup: bind(useCases.getModifierGroup),
    createModifierGroup: bind(useCases.createModifierGroup),
    updateModifierGroup: bind(useCases.updateModifierGroup),
    createModifier: bind(useCases.createModifier),
    updateModifier: bind(useCases.updateModifier),
  };
}

export type CatalogService = ReturnType<typeof catalogService>;
