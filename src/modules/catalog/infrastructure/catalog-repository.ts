import { and, asc, count, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';
import {
  category,
  modifier,
  modifierGroup,
  product,
  productModifierGroup,
  productStore,
} from '@/shared/db/schema';
import type { Id } from '@/shared/kernel';
import type { CatalogRepository } from '../application/ports';

/** Bloqueio otimista (ADR-0008): o UPDATE só casa com a versão lida e a incrementa. */
const bumpVersion = (column: AnyMySqlColumn) => sql`${column} + 1`;

/** Texto da busca vira padrão LIKE literal: % e _ digitados não são curingas. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

const categoryColumns = {
  id: category.id,
  companyId: category.companyId,
  name: category.name,
  sortOrder: category.sortOrder,
  active: category.active,
  version: category.version,
};

const productColumns = {
  id: product.id,
  companyId: product.companyId,
  categoryId: product.categoryId,
  name: product.name,
  sku: product.sku,
  description: product.description,
  requiresPreparation: product.requiresPreparation,
  active: product.active,
  version: product.version,
};

const productStoreColumns = {
  storeId: productStore.storeId,
  productId: productStore.productId,
  priceCents: productStore.priceCents,
  available: productStore.available,
  version: productStore.version,
};

const groupColumns = {
  id: modifierGroup.id,
  companyId: modifierGroup.companyId,
  name: modifierGroup.name,
  minSelect: modifierGroup.minSelect,
  maxSelect: modifierGroup.maxSelect,
  active: modifierGroup.active,
  version: modifierGroup.version,
};

const modifierColumns = {
  id: modifier.id,
  modifierGroupId: modifier.modifierGroupId,
  name: modifier.name,
  priceDeltaCents: modifier.priceDeltaCents,
  active: modifier.active,
  version: modifier.version,
};

/** Limite da lista de produtos (cardápio do piloto: dezenas a poucas centenas). */
const PRODUCT_LIST_LIMIT = 500;

export const catalogRepository: CatalogRepository = {
  // ---- Categorias ----

  async listCategories(tx, companyId) {
    const rows = await tx
      .select({ ...categoryColumns, productCount: count(product.id) })
      .from(category)
      .leftJoin(product, eq(product.categoryId, category.id))
      .where(eq(category.companyId, companyId))
      .groupBy(...Object.values(categoryColumns))
      .orderBy(asc(category.sortOrder), asc(category.name));
    return rows;
  },

  async findCategory(tx, { companyId, categoryId }) {
    const [row] = await tx
      .select(categoryColumns)
      .from(category)
      .where(and(eq(category.id, categoryId), eq(category.companyId, companyId)));
    return row ?? null;
  },

  async lockCategoryOrder(tx, companyId) {
    // Leitura COM TRAVA: dois "subir/descer" simultâneos passam em fila
    const rows = await tx
      .select({ id: category.id })
      .from(category)
      .where(eq(category.companyId, companyId))
      .orderBy(asc(category.sortOrder), asc(category.name))
      .for('update');
    return rows.map((row) => row.id);
  },

  async nextCategorySortOrder(tx, companyId) {
    // Sem trava: dois cadastros simultâneos podem empatar; o nome desempata e "subir/descer"
    // renumera — travar aqui arriscaria deadlock entre cadastros por causa da trava de intervalo
    const [row] = await tx
      .select({ next: sql<string>`coalesce(max(${category.sortOrder}) + 1, 0)` })
      .from(category)
      .where(eq(category.companyId, companyId));
    return Number(row?.next ?? 0);
  },

  async insertCategory(tx, input) {
    await tx.insert(category).values(input);
  },

  async updateCategory(tx, id, version, data) {
    const [result] = await tx
      .update(category)
      .set({ ...data, version: bumpVersion(category.version) })
      .where(and(eq(category.id, id), eq(category.version, version)));
    return result.affectedRows === 1;
  },

  async setCategorySortOrder(tx, id, sortOrder) {
    await tx.update(category).set({ sortOrder }).where(eq(category.id, id));
  },

  // ---- Produtos ----

  async listProducts(tx, filter) {
    const conditions = [eq(product.companyId, filter.companyId)];
    if (!filter.includeInactive) conditions.push(eq(product.active, true));
    if (filter.categoryId) conditions.push(eq(product.categoryId, filter.categoryId));
    if (filter.search) {
      const pattern = likePattern(filter.search);
      const match = or(like(product.name, pattern), like(product.sku, pattern));
      if (match) conditions.push(match);
    }
    return tx
      .select({
        ...productColumns,
        categoryName: category.name,
        categoryActive: category.active,
        priceCents: productStore.priceCents,
        available: productStore.available,
      })
      .from(product)
      .innerJoin(category, eq(category.id, product.categoryId))
      .leftJoin(
        productStore,
        and(eq(productStore.productId, product.id), eq(productStore.storeId, filter.storeId)),
      )
      .where(and(...conditions))
      .orderBy(asc(category.sortOrder), asc(category.name), asc(product.name))
      .limit(PRODUCT_LIST_LIMIT);
  },

  async findProduct(tx, { companyId, productId }, options = {}) {
    const query = tx
      .select(productColumns)
      .from(product)
      .where(and(eq(product.id, productId), eq(product.companyId, companyId)));
    const [row] = await (options.forUpdate ? query.for('update') : query);
    return row ?? null;
  },

  async insertProduct(tx, input) {
    await tx.insert(product).values(input);
  },

  async updateProduct(tx, id, version, data) {
    const [result] = await tx
      .update(product)
      .set({ ...data, version: bumpVersion(product.version) })
      .where(and(eq(product.id, id), eq(product.version, version)));
    return result.affectedRows === 1;
  },

  async setProductActive(tx, id, version, active) {
    const [result] = await tx
      .update(product)
      .set({ active, version: bumpVersion(product.version) })
      .where(and(eq(product.id, id), eq(product.version, version)));
    return result.affectedRows === 1;
  },

  async listProductModifierGroupIds(tx, productId) {
    const rows = await tx
      .select({ id: productModifierGroup.modifierGroupId })
      .from(productModifierGroup)
      .where(eq(productModifierGroup.productId, productId));
    return rows.map((row) => row.id);
  },

  async replaceProductModifierGroups(tx, productId, groupIds) {
    await tx.delete(productModifierGroup).where(eq(productModifierGroup.productId, productId));
    if (groupIds.length === 0) return;
    await tx
      .insert(productModifierGroup)
      .values(groupIds.map((modifierGroupId) => ({ productId, modifierGroupId })));
  },

  // ---- Preço e disponibilidade na loja ----

  listProductStores(tx, productId) {
    return tx
      .select(productStoreColumns)
      .from(productStore)
      .where(eq(productStore.productId, productId));
  },

  async findProductStore(tx, { storeId, productId }, options = {}) {
    const query = tx
      .select(productStoreColumns)
      .from(productStore)
      .where(and(eq(productStore.storeId, storeId), eq(productStore.productId, productId)));
    const [row] = await (options.forUpdate ? query.for('update') : query);
    return row ?? null;
  },

  async insertProductStore(tx, input) {
    await tx.insert(productStore).values(input);
  },

  async updateProductStorePrice(tx, { storeId, productId, version, priceCents }) {
    const [result] = await tx
      .update(productStore)
      .set({ priceCents, version: bumpVersion(productStore.version) })
      .where(
        and(
          eq(productStore.storeId, storeId),
          eq(productStore.productId, productId),
          eq(productStore.version, version),
        ),
      );
    return result.affectedRows === 1;
  },

  async deleteProductStore(tx, { storeId, productId, version }) {
    const [result] = await tx
      .delete(productStore)
      .where(
        and(
          eq(productStore.storeId, storeId),
          eq(productStore.productId, productId),
          eq(productStore.version, version),
        ),
      );
    return result.affectedRows === 1;
  },

  async setProductStoreAvailable(tx, { storeId, productId, available }) {
    // Sem mexer na versão (RN-CAT-09): não conflita com quem está editando o preço
    await tx
      .update(productStore)
      .set({ available })
      .where(and(eq(productStore.storeId, storeId), eq(productStore.productId, productId)));
  },

  // ---- Adicionais ----

  listModifierGroups(tx, companyId) {
    return tx
      .select(groupColumns)
      .from(modifierGroup)
      .where(eq(modifierGroup.companyId, companyId))
      .orderBy(asc(modifierGroup.name));
  },

  async findModifierGroup(tx, { companyId, groupId }) {
    const [row] = await tx
      .select(groupColumns)
      .from(modifierGroup)
      .where(and(eq(modifierGroup.id, groupId), eq(modifierGroup.companyId, companyId)));
    return row ?? null;
  },

  async existingModifierGroupIds(tx, companyId, ids) {
    if (ids.length === 0) return new Set<Id>();
    const rows = await tx
      .select({ id: modifierGroup.id })
      .from(modifierGroup)
      .where(and(eq(modifierGroup.companyId, companyId), inArray(modifierGroup.id, [...ids])));
    return new Set(rows.map((row) => row.id));
  },

  async insertModifierGroup(tx, input) {
    await tx.insert(modifierGroup).values(input);
  },

  async updateModifierGroup(tx, id, version, data) {
    const [result] = await tx
      .update(modifierGroup)
      .set({ ...data, version: bumpVersion(modifierGroup.version) })
      .where(and(eq(modifierGroup.id, id), eq(modifierGroup.version, version)));
    return result.affectedRows === 1;
  },

  async listModifiers(tx, groupIds) {
    if (groupIds.length === 0) return [];
    return (
      tx
        .select(modifierColumns)
        .from(modifier)
        .where(inArray(modifier.modifierGroupId, [...groupIds]))
        // UUIDv7 cresce com o tempo: ordem do id = ordem de cadastro
        .orderBy(asc(modifier.id))
    );
  },

  async findModifier(tx, { companyId, modifierId }) {
    const [row] = await tx
      .select(modifierColumns)
      .from(modifier)
      .innerJoin(modifierGroup, eq(modifierGroup.id, modifier.modifierGroupId))
      .where(and(eq(modifier.id, modifierId), eq(modifierGroup.companyId, companyId)));
    return row ?? null;
  },

  async insertModifier(tx, input) {
    await tx.insert(modifier).values(input);
  },

  async updateModifier(tx, id, version, data) {
    const [result] = await tx
      .update(modifier)
      .set({ ...data, version: bumpVersion(modifier.version) })
      .where(and(eq(modifier.id, id), eq(modifier.version, version)));
    return result.affectedRows === 1;
  },

  // ---- Cardápio da loja (RN-CAT-10) ----

  listMenu(tx, { companyId, storeId, onlyAvailable }) {
    return tx
      .select({
        productId: product.id,
        name: product.name,
        description: product.description,
        requiresPreparation: product.requiresPreparation,
        categoryId: category.id,
        categoryName: category.name,
        categorySortOrder: category.sortOrder,
        priceCents: productStore.priceCents,
        available: productStore.available,
      })
      .from(productStore)
      .innerJoin(product, eq(product.id, productStore.productId))
      .innerJoin(category, eq(category.id, product.categoryId))
      .where(
        and(
          eq(productStore.storeId, storeId),
          eq(product.companyId, companyId),
          eq(product.active, true),
          eq(category.active, true),
          onlyAvailable ? eq(productStore.available, true) : undefined,
        ),
      )
      .orderBy(asc(category.sortOrder), asc(category.name), asc(product.name));
  },

  async listMenuModifiers(tx, productIds) {
    if (productIds.length === 0) return [];
    return tx
      .select({
        productId: productModifierGroup.productId,
        groupId: modifierGroup.id,
        groupName: modifierGroup.name,
        minSelect: modifierGroup.minSelect,
        maxSelect: modifierGroup.maxSelect,
        modifierId: modifier.id,
        modifierName: modifier.name,
        priceDeltaCents: modifier.priceDeltaCents,
      })
      .from(productModifierGroup)
      .innerJoin(modifierGroup, eq(modifierGroup.id, productModifierGroup.modifierGroupId))
      .leftJoin(
        modifier,
        and(eq(modifier.modifierGroupId, modifierGroup.id), eq(modifier.active, true)),
      )
      .where(
        and(
          inArray(productModifierGroup.productId, [...productIds]),
          eq(modifierGroup.active, true),
        ),
      )
      .orderBy(asc(modifierGroup.name), asc(modifier.id));
  },
};
