import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { recipe, recipeItem } from '@/shared/db/schema';
import { newId, Quantity } from '@/shared/kernel';
import type { RecipesRepository } from '../application/ports';

// DECIMAL(14,3) ⇄ milésimos sem float (ADR-0003)
const toThousandths = (value: string) => Quantity.of(value, 'un').thousandths;
const toDecimal = (thousandths: number) =>
  Quantity.fromThousandths(thousandths, 'un').toDecimalString();

export const recipesRepository: RecipesRepository = {
  async findRecipe(tx, { companyId, kind, targetId }, options = {}) {
    const owner = kind === 'PRODUCT' ? recipe.productId : recipe.modifierId;
    const query = tx
      .select({ id: recipe.id, version: recipe.version })
      .from(recipe)
      .where(and(eq(owner, targetId), eq(recipe.companyId, companyId)));
    // Com trava: duas pessoas salvando a mesma ficha passam em fila
    const [found] = await (options.forUpdate ? query.for('update') : query);
    if (!found) return null;
    const lines = await tx
      .select({ ingredientId: recipeItem.ingredientId, quantity: recipeItem.quantity })
      .from(recipeItem)
      .where(eq(recipeItem.recipeId, found.id))
      .orderBy(asc(recipeItem.id));
    return {
      id: found.id,
      version: found.version,
      lines: lines.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: toThousandths(line.quantity),
      })),
    };
  },

  async listLines(tx, { companyId, productIds, modifierIds }) {
    // Sem filtro = todas as fichas da empresa; com filtro vazio = nenhuma
    const filtered = productIds !== undefined || modifierIds !== undefined;
    const owners = [
      productIds?.length ? inArray(recipe.productId, [...productIds]) : undefined,
      modifierIds?.length ? inArray(recipe.modifierId, [...modifierIds]) : undefined,
    ].filter((condition) => condition !== undefined);
    if (filtered && owners.length === 0) return [];
    const rows = await tx
      .select({
        productId: recipe.productId,
        modifierId: recipe.modifierId,
        ingredientId: recipeItem.ingredientId,
        quantity: recipeItem.quantity,
      })
      .from(recipeItem)
      .innerJoin(recipe, eq(recipe.id, recipeItem.recipeId))
      .where(and(eq(recipe.companyId, companyId), filtered ? or(...owners) : undefined))
      .orderBy(asc(recipeItem.id));
    return rows.map((row) => ({ ...row, quantity: toThousandths(row.quantity) }));
  },

  async insertRecipe(tx, { id, companyId, kind, targetId, updatedBy }) {
    await tx.insert(recipe).values({
      id,
      companyId,
      productId: kind === 'PRODUCT' ? targetId : null,
      modifierId: kind === 'MODIFIER' ? targetId : null,
      updatedBy,
    });
  },

  async bumpRecipe(tx, id, version, updatedBy) {
    const [result] = await tx
      .update(recipe)
      .set({ updatedBy, version: sql`${recipe.version} + 1` })
      .where(and(eq(recipe.id, id), eq(recipe.version, version)));
    return result.affectedRows === 1;
  },

  async replaceLines(tx, recipeId, lines) {
    await tx.delete(recipeItem).where(eq(recipeItem.recipeId, recipeId));
    if (lines.length === 0) return;
    await tx.insert(recipeItem).values(
      lines.map((line) => ({
        id: newId(),
        recipeId,
        ingredientId: line.ingredientId,
        quantity: toDecimal(line.quantity),
      })),
    );
  },
};
