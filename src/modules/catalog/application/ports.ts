import type { StoreAccess, StoreInfo } from '@/modules/organizations';
import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id } from '@/shared/kernel';

// ---- Registros ----

export interface CategoryData {
  readonly name: string;
  readonly active: boolean;
}

export interface CategoryRecord extends CategoryData {
  readonly id: Id;
  readonly companyId: Id;
  readonly sortOrder: number;
  readonly version: number;
}

export interface ProductData {
  readonly name: string;
  readonly categoryId: Id;
  readonly sku: string | null;
  readonly description: string | null;
  readonly requiresPreparation: boolean;
}

export interface ProductRecord extends ProductData {
  readonly id: Id;
  readonly companyId: Id;
  readonly active: boolean;
  readonly version: number;
}

export interface ProductStoreRecord {
  readonly storeId: Id;
  readonly productId: Id;
  readonly priceCents: number;
  readonly available: boolean;
  readonly version: number;
}

/** Linha da lista de produtos: produto + categoria + situação na loja da tela. */
export interface ProductListRow extends ProductRecord {
  readonly categoryName: string;
  readonly categoryActive: boolean;
  /** null = não vendido nesta loja. */
  readonly priceCents: number | null;
  readonly available: boolean | null;
}

export interface ModifierGroupData {
  readonly name: string;
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly active: boolean;
}

export interface ModifierGroupRecord extends ModifierGroupData {
  readonly id: Id;
  readonly companyId: Id;
  readonly version: number;
}

export interface ModifierData {
  readonly name: string;
  readonly priceDeltaCents: number;
  readonly active: boolean;
}

export interface ModifierRecord extends ModifierData {
  readonly id: Id;
  readonly modifierGroupId: Id;
  readonly version: number;
}

/** Produto vendável na loja (RN-CAT-10), sem os adicionais. */
export interface MenuRow {
  readonly productId: Id;
  readonly name: string;
  readonly description: string | null;
  readonly requiresPreparation: boolean;
  readonly categoryId: Id;
  readonly categoryName: string;
  readonly categorySortOrder: number;
  readonly priceCents: number;
  readonly available: boolean;
}

/** Grupo ATIVO de um produto do cardápio, com uma opção ATIVA por linha (ou sem opção). */
export interface MenuModifierRow {
  readonly productId: Id;
  readonly groupId: Id;
  readonly groupName: string;
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly modifierId: Id | null;
  readonly modifierName: string | null;
  readonly priceDeltaCents: number | null;
}

// ---- Repositório (implementado em infrastructure/) ----

/**
 * Toda busca por id exige a EMPRESA ou a LOJA (ADR-0009, camada 2): de outro escopo = inexistente.
 * Updates são condicionais à versão lida (ADR-0008): false = outra pessoa alterou antes.
 */
export interface CatalogRepository {
  listCategories(
    tx: Transaction,
    companyId: Id,
  ): Promise<(CategoryRecord & { productCount: number })[]>;
  findCategory(
    tx: Transaction,
    scope: { companyId: Id; categoryId: Id },
  ): Promise<CategoryRecord | null>;
  /** Categorias da empresa na ordem atual, COM TRAVA (reordenar em fila). */
  lockCategoryOrder(tx: Transaction, companyId: Id): Promise<{ id: Id; sortOrder: number }[]>;
  nextCategorySortOrder(tx: Transaction, companyId: Id): Promise<number>;
  insertCategory(
    tx: Transaction,
    input: { id: Id; companyId: Id; name: string; sortOrder: number },
  ): Promise<void>;
  updateCategory(tx: Transaction, id: Id, version: number, data: CategoryData): Promise<boolean>;
  setCategorySortOrder(tx: Transaction, id: Id, sortOrder: number): Promise<void>;

  listProducts(
    tx: Transaction,
    filter: {
      companyId: Id;
      storeId: Id;
      search: string | null;
      categoryId: Id | null;
      includeInactive: boolean;
    },
  ): Promise<ProductListRow[]>;
  findProduct(
    tx: Transaction,
    scope: { companyId: Id; productId: Id },
    options?: { forUpdate?: boolean },
  ): Promise<ProductRecord | null>;
  insertProduct(tx: Transaction, input: ProductData & { id: Id; companyId: Id }): Promise<void>;
  updateProduct(tx: Transaction, id: Id, version: number, data: ProductData): Promise<boolean>;
  setProductActive(tx: Transaction, id: Id, version: number, active: boolean): Promise<boolean>;
  listProductModifierGroupIds(tx: Transaction, productId: Id): Promise<Id[]>;
  replaceProductModifierGroups(
    tx: Transaction,
    productId: Id,
    groupIds: readonly Id[],
  ): Promise<void>;

  listProductStores(tx: Transaction, productId: Id): Promise<ProductStoreRecord[]>;
  findProductStore(
    tx: Transaction,
    scope: { storeId: Id; productId: Id },
    options?: { forUpdate?: boolean },
  ): Promise<ProductStoreRecord | null>;
  insertProductStore(
    tx: Transaction,
    input: { storeId: Id; productId: Id; priceCents: number },
  ): Promise<void>;
  updateProductStorePrice(
    tx: Transaction,
    input: { storeId: Id; productId: Id; version: number; priceCents: number },
  ): Promise<boolean>;
  deleteProductStore(
    tx: Transaction,
    input: { storeId: Id; productId: Id; version: number },
  ): Promise<boolean>;
  setProductStoreAvailable(
    tx: Transaction,
    input: { storeId: Id; productId: Id; available: boolean },
  ): Promise<void>;

  listModifierGroups(tx: Transaction, companyId: Id): Promise<ModifierGroupRecord[]>;
  findModifierGroup(
    tx: Transaction,
    scope: { companyId: Id; groupId: Id },
  ): Promise<ModifierGroupRecord | null>;
  /** Quais destes grupos existem na empresa (ativos ou não). */
  existingModifierGroupIds(tx: Transaction, companyId: Id, ids: readonly Id[]): Promise<Set<Id>>;
  insertModifierGroup(
    tx: Transaction,
    input: ModifierGroupData & { id: Id; companyId: Id },
  ): Promise<void>;
  updateModifierGroup(
    tx: Transaction,
    id: Id,
    version: number,
    data: ModifierGroupData,
  ): Promise<boolean>;

  listModifiers(tx: Transaction, groupIds: readonly Id[]): Promise<ModifierRecord[]>;
  /** Todas as opções da empresa com o nome do grupo (ficha técnica — Recipes). */
  listCompanyModifiers(
    tx: Transaction,
    companyId: Id,
  ): Promise<(ModifierRecord & { groupName: string; groupActive: boolean })[]>;
  /** Opção de um grupo DA EMPRESA. */
  findModifier(
    tx: Transaction,
    scope: { companyId: Id; modifierId: Id },
  ): Promise<ModifierRecord | null>;
  insertModifier(
    tx: Transaction,
    input: ModifierData & { id: Id; modifierGroupId: Id },
  ): Promise<void>;
  updateModifier(tx: Transaction, id: Id, version: number, data: ModifierData): Promise<boolean>;

  /** Cardápio da loja (RN-CAT-10). `onlyAvailable: false` inclui os que acabaram. */
  listMenu(
    tx: Transaction,
    scope: { companyId: Id; storeId: Id; onlyAvailable: boolean },
  ): Promise<MenuRow[]>;
  listMenuModifiers(tx: Transaction, productIds: readonly Id[]): Promise<MenuModifierRow[]>;
}

/** O que o catálogo usa do módulo Organizations: lojas ATIVAS. */
export interface StoreDirectory {
  findStore(tx: Transaction, storeId: Id): Promise<StoreInfo | null>;
  listStores(tx: Transaction, organizationId: Id): Promise<StoreInfo[]>;
}

export interface CatalogDependencies {
  readonly db: Database;
  readonly repo: CatalogRepository;
  readonly stores: StoreDirectory;
  readonly access: Pick<StoreAccess, 'storesWithPermission'>;
}
