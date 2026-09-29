// Tabelas do módulo Recipes (Etapa 5 — docs/modules/recipes.md §6).
// Caminhos relativos: o drizzle-kit não entende o atalho "@/".
import { sql } from 'drizzle-orm';
import { check, decimal, index, mysqlTable, uniqueIndex } from 'drizzle-orm/mysql-core';
import { timestamps, version } from '../columns';
import { uuidBinary } from '../uuid-binary';
import { modifier, product } from './catalog';
import { ingredient } from './inventory';
import { company } from './organizations';

/** Ficha técnica de UM produto ou de UM adicional (RN-REC-01, Q-09). */
export const recipe = mysqlTable(
  'recipe',
  {
    id: uuidBinary('id').primaryKey(),
    companyId: uuidBinary('company_id')
      .notNull()
      .references(() => company.id),
    productId: uuidBinary('product_id').references(() => product.id),
    modifierId: uuidBinary('modifier_id').references(() => modifier.id),
    version: version(),
    updatedBy: uuidBinary('updated_by').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_recipe_product').on(table.productId),
    uniqueIndex('uq_recipe_modifier').on(table.modifierId),
    index('ix_recipe_company').on(table.companyId),
    check('ck_recipe_owner', sql`(${table.productId} IS NULL) <> (${table.modifierId} IS NULL)`),
  ],
);

/** Quanto do insumo (unidade base) vai em UMA unidade vendida (RN-REC-02). */
export const recipeItem = mysqlTable(
  'recipe_item',
  {
    id: uuidBinary('id').primaryKey(),
    recipeId: uuidBinary('recipe_id')
      .notNull()
      .references(() => recipe.id),
    ingredientId: uuidBinary('ingredient_id')
      .notNull()
      .references(() => ingredient.id),
    quantity: decimal('quantity', { precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex('uq_recipe_item_ingredient').on(table.recipeId, table.ingredientId),
    index('ix_recipe_item_ingredient').on(table.ingredientId),
    check('ck_recipe_item_quantity', sql`${table.quantity} > 0`),
  ],
);
