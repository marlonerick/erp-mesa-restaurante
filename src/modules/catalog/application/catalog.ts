import { recordAuditFromContext } from '@/modules/audit';
import type { StoreInfo } from '@/modules/organizations';
import { MYSQL_ERRNO, mysqlErrno } from '@/shared/db/mysql-errors';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import {
  DomainError,
  type Id,
  newId,
  type RequestContext,
  requirePermission,
} from '@/shared/kernel';
import {
  categoryName,
  modifierGroupName,
  modifierName,
  type MoveDirection,
  moveInOrder,
  normalizeDescription,
  normalizeSku,
  productName,
  selectionIsSatisfiable,
  validateModifierGroupIds,
  validateModifierPriceCents,
  validatePriceCents,
  validateSelectionLimits,
} from '../domain/rules';
import type {
  CatalogDependencies,
  CategoryData,
  CategoryRecord,
  MenuModifierRow,
  MenuRow,
  ModifierData,
  ModifierGroupData,
  ModifierGroupRecord,
  ModifierRecord,
  ProductData,
  ProductListRow,
  ProductRecord,
  ProductStoreRecord,
} from './ports';

// ---- Erros (docs/modules/catalog.md §6) ----

const notFound = (code: string, message: string) => () =>
  new DomainError(code, message, 'NOT_FOUND');
const taken = (code: string, message: string) => () => new DomainError(code, message, 'CONFLICT');

const errors = {
  storeNotFound: notFound('STORE_NOT_FOUND', 'Loja não encontrada.'),
  categoryNotFound: notFound('CATEGORY_NOT_FOUND', 'Categoria não encontrada.'),
  productNotFound: notFound('PRODUCT_NOT_FOUND', 'Produto não encontrado.'),
  groupNotFound: notFound('MODIFIER_GROUP_NOT_FOUND', 'Grupo de adicionais não encontrado.'),
  modifierNotFound: notFound('MODIFIER_NOT_FOUND', 'Adicional não encontrado.'),
  categoryTaken: taken(
    'CATEGORY_NAME_TAKEN',
    'Já existe uma categoria com este nome (talvez desativada).',
  ),
  productTaken: taken(
    'PRODUCT_NAME_TAKEN',
    'Já existe um produto com este nome (talvez desativado).',
  ),
  skuTaken: taken('SKU_TAKEN', 'Já existe um produto com este código.'),
  groupTaken: taken(
    'MODIFIER_GROUP_NAME_TAKEN',
    'Já existe um grupo de adicionais com este nome (talvez desativado).',
  ),
  modifierTaken: taken(
    'MODIFIER_NAME_TAKEN',
    'Já existe um adicional com este nome neste grupo (talvez desativado).',
  ),
  categoryInactive: () =>
    new DomainError(
      'CATEGORY_INACTIVE',
      'Esta categoria está desativada. Escolha outra ou reative-a.',
      'BUSINESS_RULE',
    ),
  notOnMenu: () =>
    new DomainError(
      'PRODUCT_NOT_ON_MENU',
      'Este produto não é vendido nesta loja.',
      'BUSINESS_RULE',
    ),
  forbidden: () =>
    new DomainError('FORBIDDEN', 'Você não tem permissão para esta ação.', 'FORBIDDEN', {
      permission: 'products.update',
    }),
  concurrent: () =>
    new DomainError(
      'CONCURRENT_MODIFICATION',
      'Outra pessoa alterou estes dados. Recarregue a página e tente de novo.',
      'CONFLICT',
    ),
};

/**
 * Índice único violado → erro de negócio claro. `byIndex` escolhe o erro pelo nome do índice
 * (produto: nome ou código); senão usa `fallback`.
 */
async function mapDuplicate<T>(
  work: Promise<T>,
  fallback: () => DomainError,
  byIndex: Readonly<Record<string, () => DomainError>> = {},
): Promise<T> {
  try {
    return await work;
  } catch (caught) {
    if (mysqlErrno(caught) !== MYSQL_ERRNO.DUPLICATE_ENTRY) throw caught;
    const text = errorText(caught);
    const match = Object.entries(byIndex).find(([index]) => text.includes(index));
    throw (match?.[1] ?? fallback)();
  }
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  for (let current = error, depth = 0; current instanceof Error && depth < 5; depth += 1) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(' ');
}

/** Só os campos que mudaram — a auditoria mostra exatamente o que foi alterado (RN-CAT-14). */
function changedFields<T extends object>(before: T, after: T) {
  const same = (a: unknown, b: unknown) =>
    Array.isArray(a) && Array.isArray(b) ? a.join(',') === b.join(',') : a === b;
  const keys = (Object.keys(after) as (keyof T)[]).filter((key) => !same(before[key], after[key]));
  return {
    before: Object.fromEntries(keys.map((key) => [key, before[key]])),
    after: Object.fromEntries(keys.map((key) => [key, after[key]])),
    changed: keys.length > 0,
  };
}

// ---- Escopo (RN-CAT-01) ----

/** Loja ativa da sessão → a empresa dona do catálogo. */
async function activeStore(
  deps: CatalogDependencies,
  tx: Transaction,
  ctx: RequestContext,
): Promise<StoreInfo> {
  const found = await deps.stores.findStore(tx, ctx.storeId);
  if (found?.organizationId !== ctx.organizationId) throw errors.storeNotFound();
  return found;
}

/**
 * Loja do PREÇO (RN-CAT-07): ativa, da mesma empresa e com `products.update` NELA — o gerente do
 * Centro não altera a Praia. De outra empresa/organização: "não encontrada".
 */
async function priceStore(
  deps: CatalogDependencies,
  tx: Transaction,
  ctx: RequestContext,
  companyId: Id,
  storeId: Id,
): Promise<StoreInfo> {
  const found = await deps.stores.findStore(tx, storeId);
  if (found?.organizationId !== ctx.organizationId || found.companyId !== companyId) {
    throw errors.storeNotFound();
  }
  const allowed = await deps.access.storesWithPermission(
    tx,
    ctx.userId,
    [found],
    'products.update',
  );
  if (!allowed.has(found.id)) throw errors.forbidden();
  return found;
}

async function findCategoryOf(
  deps: CatalogDependencies,
  tx: Transaction,
  companyId: Id,
  categoryId: Id,
): Promise<CategoryRecord> {
  const found = await deps.repo.findCategory(tx, { companyId, categoryId });
  if (!found) throw errors.categoryNotFound();
  return found;
}

async function findProductOf(
  deps: CatalogDependencies,
  tx: Transaction,
  companyId: Id,
  productId: Id,
  options: { forUpdate?: boolean } = {},
): Promise<ProductRecord> {
  const found = await deps.repo.findProduct(tx, { companyId, productId }, options);
  if (!found) throw errors.productNotFound();
  return found;
}

async function findGroupOf(
  deps: CatalogDependencies,
  tx: Transaction,
  companyId: Id,
  groupId: Id,
): Promise<ModifierGroupRecord> {
  const found = await deps.repo.findModifierGroup(tx, { companyId, groupId });
  if (!found) throw errors.groupNotFound();
  return found;
}

/** Grupos informados existem na empresa? (grupo de outra empresa = inexistente) */
async function checkModifierGroups(
  deps: CatalogDependencies,
  tx: Transaction,
  companyId: Id,
  ids: readonly Id[],
): Promise<void> {
  if (ids.length === 0) return;
  const existing = await deps.repo.existingModifierGroupIds(tx, companyId, ids);
  if (ids.some((id) => !existing.has(id))) throw errors.groupNotFound();
}

// ---- Categorias (RN-CAT-02, RN-CAT-03) ----

export interface CategoryView extends CategoryRecord {
  readonly productCount: number;
}

export async function listCategories(
  deps: CatalogDependencies,
  ctx: RequestContext,
): Promise<CategoryView[]> {
  requirePermission(ctx, 'products.read');
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    return deps.repo.listCategories(tx, companyId);
  });
}

export async function getCategory(
  deps: CatalogDependencies,
  ctx: RequestContext,
  categoryId: Id,
): Promise<CategoryRecord> {
  requirePermission(ctx, 'products.read');
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    return findCategoryOf(deps, tx, companyId, categoryId);
  });
}

export async function createCategory(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: { name: string },
): Promise<{ id: Id }> {
  requirePermission(ctx, 'products.create');
  const name = categoryName(input.name);
  const id = newId();
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      const sortOrder = await deps.repo.nextCategorySortOrder(tx, companyId);
      await deps.repo.insertCategory(tx, { id, companyId, name, sortOrder });
      await recordAuditFromContext(tx, ctx, 'CATEGORY_CREATED', {
        storeId: null, // catálogo da empresa: vale para todas as lojas (RN-CAT-14)
        entityType: 'category',
        entityId: id,
        after: { name },
      });
    }),
    errors.categoryTaken,
  );
  return { id };
}

export async function updateCategory(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: { categoryId: Id; version: number; name: string; active: boolean },
): Promise<void> {
  requirePermission(ctx, 'products.update');
  const data: CategoryData = { name: categoryName(input.name), active: input.active };
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      const current = await findCategoryOf(deps, tx, companyId, input.categoryId);
      if (current.version !== input.version) throw errors.concurrent();
      const diff = changedFields<CategoryData>(
        { name: current.name, active: current.active },
        data,
      );
      if (!diff.changed) return;
      if (!(await deps.repo.updateCategory(tx, current.id, input.version, data))) {
        throw errors.concurrent();
      }
      await recordAuditFromContext(tx, ctx, 'CATEGORY_UPDATED', {
        storeId: null,
        entityType: 'category',
        entityId: current.id,
        before: diff.before,
        after: diff.after,
      });
    }),
    errors.categoryTaken,
  );
}

/**
 * Subir/descer a categoria (RN-CAT-02). A ordem da empresa é lida COM TRAVA: dois cliques
 * simultâneos passam em fila e nenhum desfaz o outro. Só aparência: não audita.
 */
export async function moveCategory(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: { categoryId: Id; direction: MoveDirection },
): Promise<void> {
  requirePermission(ctx, 'products.update');
  await runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const order = await deps.repo.lockCategoryOrder(tx, companyId);
    const moved = moveInOrder(order, input.categoryId, input.direction);
    if (!moved) throw errors.categoryNotFound();
    for (const [index, id] of moved.entries()) {
      if (order[index] !== id) await deps.repo.setCategorySortOrder(tx, id, index);
    }
  });
}

// ---- Produtos (RN-CAT-04 a RN-CAT-06) ----

export interface ProductInput {
  readonly name: string;
  readonly categoryId: Id;
  readonly sku: string | null;
  readonly description: string | null;
  readonly requiresPreparation: boolean;
  readonly modifierGroupIds: readonly Id[];
}

function validateProduct(input: ProductInput) {
  const data: ProductData = {
    name: productName(input.name),
    categoryId: input.categoryId,
    sku: normalizeSku(input.sku),
    description: normalizeDescription(input.description),
    requiresPreparation: input.requiresPreparation,
  };
  return { data, modifierGroupIds: validateModifierGroupIds(input.modifierGroupIds) };
}

const productDuplicates = { uq_product_company_sku: errors.skuTaken };

export async function listProducts(
  deps: CatalogDependencies,
  ctx: RequestContext,
  filter: { search?: string; categoryId?: Id | null; includeInactive?: boolean } = {},
): Promise<ProductListRow[]> {
  requirePermission(ctx, 'products.read');
  const search = filter.search?.trim().slice(0, 80) ?? '';
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    return deps.repo.listProducts(tx, {
      companyId,
      storeId: ctx.storeId,
      search: search === '' ? null : search,
      categoryId: filter.categoryId ?? null,
      includeInactive: filter.includeInactive ?? false,
    });
  });
}

export interface StorePriceView {
  readonly storeId: Id;
  readonly storeName: string;
  /** null = não vende nesta loja. */
  readonly price: ProductStoreRecord | null;
}

export interface ProductView extends ProductRecord {
  readonly modifierGroupIds: Id[];
  /** Lojas da empresa em que a pessoa pode alterar o preço (RN-CAT-07). */
  readonly prices: StorePriceView[];
}

export async function getProduct(
  deps: CatalogDependencies,
  ctx: RequestContext,
  productId: Id,
): Promise<ProductView> {
  requirePermission(ctx, 'products.read');
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const product = await findProductOf(deps, tx, companyId, productId);
    const companyStores = (await deps.stores.listStores(tx, ctx.organizationId)).filter(
      (item) => item.companyId === companyId,
    );
    const allowed = await deps.access.storesWithPermission(
      tx,
      ctx.userId,
      companyStores,
      'products.update',
    );
    const prices = new Map(
      (await deps.repo.listProductStores(tx, product.id)).map((row) => [row.storeId, row]),
    );
    return {
      ...product,
      modifierGroupIds: await deps.repo.listProductModifierGroupIds(tx, product.id),
      prices: companyStores
        .filter((item) => allowed.has(item.id))
        .map((item) => ({
          storeId: item.id,
          storeName: item.name,
          price: prices.get(item.id) ?? null,
        })),
    };
  });
}

/** Cadastro; com `priceHereCents`, o produto já entra à venda na loja ativa. */
export async function createProduct(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: ProductInput & { priceHereCents: number | null },
): Promise<{ id: Id }> {
  requirePermission(ctx, 'products.create');
  const { data, modifierGroupIds } = validateProduct(input);
  const priceHere = input.priceHereCents === null ? null : validatePriceCents(input.priceHereCents);
  if (priceHere !== null) requirePermission(ctx, 'products.update');
  const id = newId();
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      const category = await findCategoryOf(deps, tx, companyId, data.categoryId);
      if (!category.active) throw errors.categoryInactive();
      await checkModifierGroups(deps, tx, companyId, modifierGroupIds);
      await deps.repo.insertProduct(tx, { id, companyId, ...data });
      await deps.repo.replaceProductModifierGroups(tx, id, modifierGroupIds);
      await recordAuditFromContext(tx, ctx, 'PRODUCT_CREATED', {
        storeId: null,
        entityType: 'product',
        entityId: id,
        after: { ...data, modifierGroupIds },
      });
      if (priceHere !== null) {
        await deps.repo.insertProductStore(tx, {
          storeId: ctx.storeId,
          productId: id,
          priceCents: priceHere,
        });
        await recordAuditFromContext(tx, ctx, 'PRODUCT_PRICE_SET', {
          entityType: 'product',
          entityId: id,
          after: { priceCents: priceHere },
        });
      }
    }),
    errors.productTaken,
    productDuplicates,
  );
  return { id };
}

export async function updateProduct(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: ProductInput & { productId: Id; version: number },
): Promise<void> {
  requirePermission(ctx, 'products.update');
  const { data, modifierGroupIds } = validateProduct(input);
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      const current = await findProductOf(deps, tx, companyId, input.productId);
      if (current.version !== input.version) throw errors.concurrent();
      if (data.categoryId !== current.categoryId) {
        // Mudar PARA uma categoria desativada não; continuar numa que foi desativada, sim
        const category = await findCategoryOf(deps, tx, companyId, data.categoryId);
        if (!category.active) throw errors.categoryInactive();
      }
      await checkModifierGroups(deps, tx, companyId, modifierGroupIds);
      const currentGroups = await deps.repo.listProductModifierGroupIds(tx, current.id);
      const diff = changedFields(
        {
          name: current.name,
          categoryId: current.categoryId,
          sku: current.sku,
          description: current.description,
          requiresPreparation: current.requiresPreparation,
          modifierGroupIds: [...currentGroups].sort(),
        },
        { ...data, modifierGroupIds: [...modifierGroupIds].sort() },
      );
      if (!diff.changed) return;
      // A versão sobe mesmo quando só os adicionais mudaram: protege a troca da lista também
      if (!(await deps.repo.updateProduct(tx, current.id, input.version, data))) {
        throw errors.concurrent();
      }
      await deps.repo.replaceProductModifierGroups(tx, current.id, modifierGroupIds);
      await recordAuditFromContext(tx, ctx, 'PRODUCT_UPDATED', {
        storeId: null,
        entityType: 'product',
        entityId: current.id,
        before: diff.before,
        after: diff.after,
      });
    }),
    errors.productTaken,
    productDuplicates,
  );
}

/** Desativar/reativar (RN-CAT-05): nunca apaga; preços e adicionais ficam guardados. */
export async function setProductStatus(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: { productId: Id; version: number; active: boolean },
): Promise<void> {
  requirePermission(ctx, 'products.update');
  await runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const current = await findProductOf(deps, tx, companyId, input.productId);
    if (current.version !== input.version) throw errors.concurrent();
    if (current.active === input.active) return;
    if (!(await deps.repo.setProductActive(tx, current.id, input.version, input.active))) {
      throw errors.concurrent();
    }
    await recordAuditFromContext(tx, ctx, input.active ? 'PRODUCT_ENABLED' : 'PRODUCT_DISABLED', {
      storeId: null,
      entityType: 'product',
      entityId: current.id,
      before: { active: current.active },
      after: { active: input.active },
    });
  });
}

// ---- Preço na loja (RN-CAT-07) ----

/**
 * Define o preço numa loja. `version: null` = a tela mostrava "não vende nesta loja": se outra
 * pessoa colocou um preço antes, é conflito (não sobrescreve sem ver).
 */
export async function setStorePrice(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: { productId: Id; storeId: Id; priceCents: number; version: number | null },
): Promise<void> {
  requirePermission(ctx, 'products.update');
  const priceCents = validatePriceCents(input.priceCents);
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      const product = await findProductOf(deps, tx, companyId, input.productId);
      const target = await priceStore(deps, tx, ctx, companyId, input.storeId);
      const current = await deps.repo.findProductStore(
        tx,
        { storeId: target.id, productId: product.id },
        { forUpdate: true },
      );
      if (input.version === null) {
        if (current) throw errors.concurrent();
        await deps.repo.insertProductStore(tx, {
          storeId: target.id,
          productId: product.id,
          priceCents,
        });
      } else {
        if (current?.version !== input.version) throw errors.concurrent();
        if (current.priceCents === priceCents) return;
        const saved = await deps.repo.updateProductStorePrice(tx, {
          storeId: target.id,
          productId: product.id,
          version: input.version,
          priceCents,
        });
        if (!saved) throw errors.concurrent();
      }
      await recordAuditFromContext(tx, ctx, 'PRODUCT_PRICE_SET', {
        storeId: target.id, // a loja AFETADA (RN-CAT-14)
        entityType: 'product',
        entityId: product.id,
        before: current ? { priceCents: current.priceCents } : undefined,
        after: { priceCents },
      });
    }),
    // Dois cadastros de preço simultâneos na mesma loja: a chave primária decide
    errors.concurrent,
  );
}

/** "Parar de vender nesta loja": remove o preço (RN-CAT-07). */
export async function removeFromStore(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: { productId: Id; storeId: Id; version: number },
): Promise<void> {
  requirePermission(ctx, 'products.update');
  await runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const product = await findProductOf(deps, tx, companyId, input.productId);
    const target = await priceStore(deps, tx, ctx, companyId, input.storeId);
    const current = await deps.repo.findProductStore(
      tx,
      { storeId: target.id, productId: product.id },
      { forUpdate: true },
    );
    if (current?.version !== input.version) throw errors.concurrent();
    const removed = await deps.repo.deleteProductStore(tx, {
      storeId: target.id,
      productId: product.id,
      version: input.version,
    });
    if (!removed) throw errors.concurrent();
    await recordAuditFromContext(tx, ctx, 'PRODUCT_REMOVED_FROM_STORE', {
      storeId: target.id,
      entityType: 'product',
      entityId: product.id,
      before: { priceCents: current.priceCents, available: current.available },
    });
  });
}

// ---- Disponibilidade do dia (RN-CAT-09, RN-CAT-10) ----

export interface AvailabilityCategory {
  readonly categoryId: Id;
  readonly categoryName: string;
  readonly products: readonly MenuRow[];
}

/** Cardápio da loja ativa, com os que acabaram, agrupado por categoria. */
export async function listAvailability(
  deps: CatalogDependencies,
  ctx: RequestContext,
): Promise<AvailabilityCategory[]> {
  requirePermission(ctx, 'products.availability');
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    return groupByCategory(
      await deps.repo.listMenu(tx, { companyId, storeId: ctx.storeId, onlyAvailable: false }),
    );
  });
}

function groupByCategory(rows: readonly MenuRow[]): AvailabilityCategory[] {
  const groups = new Map<Id, { categoryId: Id; categoryName: string; products: MenuRow[] }>();
  for (const row of rows) {
    let group = groups.get(row.categoryId);
    if (!group) {
      group = { categoryId: row.categoryId, categoryName: row.categoryName, products: [] };
      groups.set(row.categoryId, group);
    }
    group.products.push(row);
  }
  return [...groups.values()];
}

/**
 * "Acabou" / "disponível" na loja ATIVA (RN-CAT-09): valor absoluto, sem versão — repetir não muda
 * nada e não conflita com quem edita o preço. Audita só quando muda.
 */
export async function setAvailability(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: { productId: Id; available: boolean },
): Promise<void> {
  requirePermission(ctx, 'products.availability');
  await runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const product = await findProductOf(deps, tx, companyId, input.productId);
    const current = await deps.repo.findProductStore(
      tx,
      { storeId: ctx.storeId, productId: product.id },
      { forUpdate: true },
    );
    if (!current) throw errors.notOnMenu();
    if (current.available === input.available) return;
    await deps.repo.setProductStoreAvailable(tx, {
      storeId: ctx.storeId,
      productId: product.id,
      available: input.available,
    });
    await recordAuditFromContext(tx, ctx, 'PRODUCT_AVAILABILITY_CHANGED', {
      entityType: 'product',
      entityId: product.id,
      before: { available: current.available },
      after: { available: input.available },
    });
  });
}

// ---- Adicionais (RN-CAT-11, RN-CAT-12 — Q-09) ----

export interface ModifierGroupView extends ModifierGroupRecord {
  readonly modifiers: ModifierRecord[];
  /** O mínimo cabe nas opções ativas? Se não, a tela avisa (RN-CAT-12). */
  readonly satisfiable: boolean;
}

function toGroupView(group: ModifierGroupRecord, modifiers: ModifierRecord[]): ModifierGroupView {
  const own = modifiers.filter((item) => item.modifierGroupId === group.id);
  return {
    ...group,
    modifiers: own,
    satisfiable: selectionIsSatisfiable(group.minSelect, own.filter((item) => item.active).length),
  };
}

export async function listModifierGroups(
  deps: CatalogDependencies,
  ctx: RequestContext,
): Promise<ModifierGroupView[]> {
  requirePermission(ctx, 'products.read');
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const groups = await deps.repo.listModifierGroups(tx, companyId);
    const modifiers = await deps.repo.listModifiers(
      tx,
      groups.map((group) => group.id),
    );
    return groups.map((group) => toGroupView(group, modifiers));
  });
}

export async function getModifierGroup(
  deps: CatalogDependencies,
  ctx: RequestContext,
  groupId: Id,
): Promise<ModifierGroupView> {
  requirePermission(ctx, 'products.read');
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await activeStore(deps, tx, ctx);
    const group = await findGroupOf(deps, tx, companyId, groupId);
    return toGroupView(group, await deps.repo.listModifiers(tx, [group.id]));
  });
}

export interface ModifierGroupInput {
  readonly name: string;
  readonly minSelect: number;
  readonly maxSelect: number;
}

function validateGroup(input: ModifierGroupInput & { active: boolean }): ModifierGroupData {
  return {
    name: modifierGroupName(input.name),
    ...validateSelectionLimits(input.minSelect, input.maxSelect),
    active: input.active,
  };
}

export async function createModifierGroup(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: ModifierGroupInput,
): Promise<{ id: Id }> {
  requirePermission(ctx, 'products.create');
  const data = validateGroup({ ...input, active: true });
  const id = newId();
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      await deps.repo.insertModifierGroup(tx, { id, companyId, ...data });
      await recordAuditFromContext(tx, ctx, 'MODIFIER_GROUP_CREATED', {
        storeId: null,
        entityType: 'modifier_group',
        entityId: id,
        after: { ...data },
      });
    }),
    errors.groupTaken,
  );
  return { id };
}

export async function updateModifierGroup(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: ModifierGroupInput & { groupId: Id; version: number; active: boolean },
): Promise<void> {
  requirePermission(ctx, 'products.update');
  const data = validateGroup(input);
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      const current = await findGroupOf(deps, tx, companyId, input.groupId);
      if (current.version !== input.version) throw errors.concurrent();
      const diff = changedFields<ModifierGroupData>(
        {
          name: current.name,
          minSelect: current.minSelect,
          maxSelect: current.maxSelect,
          active: current.active,
        },
        data,
      );
      if (!diff.changed) return;
      if (!(await deps.repo.updateModifierGroup(tx, current.id, input.version, data))) {
        throw errors.concurrent();
      }
      await recordAuditFromContext(tx, ctx, 'MODIFIER_GROUP_UPDATED', {
        storeId: null,
        entityType: 'modifier_group',
        entityId: current.id,
        before: diff.before,
        after: diff.after,
      });
    }),
    errors.groupTaken,
  );
}

export interface ModifierInput {
  readonly name: string;
  readonly priceDeltaCents: number;
}

export async function createModifier(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: ModifierInput & { groupId: Id },
): Promise<{ id: Id }> {
  requirePermission(ctx, 'products.create');
  const data: ModifierData = {
    name: modifierName(input.name),
    priceDeltaCents: validateModifierPriceCents(input.priceDeltaCents),
    active: true,
  };
  const id = newId();
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      const group = await findGroupOf(deps, tx, companyId, input.groupId);
      await deps.repo.insertModifier(tx, { id, modifierGroupId: group.id, ...data });
      await recordAuditFromContext(tx, ctx, 'MODIFIER_CREATED', {
        storeId: null,
        entityType: 'modifier',
        entityId: id,
        after: { groupId: group.id, name: data.name, priceDeltaCents: data.priceDeltaCents },
      });
    }),
    errors.modifierTaken,
  );
  return { id };
}

export async function updateModifier(
  deps: CatalogDependencies,
  ctx: RequestContext,
  input: ModifierInput & { modifierId: Id; version: number; active: boolean },
): Promise<void> {
  requirePermission(ctx, 'products.update');
  const data: ModifierData = {
    name: modifierName(input.name),
    priceDeltaCents: validateModifierPriceCents(input.priceDeltaCents),
    active: input.active,
  };
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      const { companyId } = await activeStore(deps, tx, ctx);
      const current = await deps.repo.findModifier(tx, { companyId, modifierId: input.modifierId });
      if (!current) throw errors.modifierNotFound();
      if (current.version !== input.version) throw errors.concurrent();
      const diff = changedFields<ModifierData>(
        { name: current.name, priceDeltaCents: current.priceDeltaCents, active: current.active },
        data,
      );
      if (!diff.changed) return;
      if (!(await deps.repo.updateModifier(tx, current.id, input.version, data))) {
        throw errors.concurrent();
      }
      await recordAuditFromContext(tx, ctx, 'MODIFIER_UPDATED', {
        storeId: null,
        entityType: 'modifier',
        entityId: current.id,
        before: diff.before,
        after: diff.after,
      });
    }),
    errors.modifierTaken,
  );
}

// ---- Cardápio da loja (consulta pública — usada pela comanda na Etapa 6) ----

export interface MenuOption {
  readonly id: Id;
  readonly name: string;
  readonly priceDeltaCents: number;
}

export interface MenuModifierGroup {
  readonly id: Id;
  readonly name: string;
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly options: MenuOption[];
}

export interface MenuProduct extends MenuRow {
  readonly modifierGroups: MenuModifierGroup[];
}

/** Produtos vendáveis AGORA na loja (RN-CAT-10), com grupos e opções ATIVOS. */
export async function storeMenu(
  deps: Pick<CatalogDependencies, 'repo'>,
  tx: Transaction,
  scope: { companyId: Id; storeId: Id },
): Promise<MenuProduct[]> {
  const rows = await deps.repo.listMenu(tx, { ...scope, onlyAvailable: true });
  const modifiers = await deps.repo.listMenuModifiers(
    tx,
    rows.map((row) => row.productId),
  );
  return rows.map((row) => ({ ...row, modifierGroups: groupsOf(row.productId, modifiers) }));
}

function groupsOf(productId: Id, rows: readonly MenuModifierRow[]): MenuModifierGroup[] {
  const groups = new Map<Id, MenuModifierGroup>();
  for (const row of rows) {
    if (row.productId !== productId) continue;
    let group = groups.get(row.groupId);
    if (!group) {
      group = {
        id: row.groupId,
        name: row.groupName,
        minSelect: row.minSelect,
        maxSelect: row.maxSelect,
        options: [],
      };
      groups.set(row.groupId, group);
    }
    if (row.modifierId !== null && row.modifierName !== null) {
      group.options.push({
        id: row.modifierId,
        name: row.modifierName,
        priceDeltaCents: row.priceDeltaCents ?? 0,
      });
    }
  }
  return [...groups.values()];
}
