// Estoque e fichas técnicas FICTÍCIOS do seed (regra inviolável 8 do README): insumos com uma
// compra inicial no Centro e na Praia (saldo + movimentação, como o sistema faria) e as fichas dos
// produtos e adicionais do cardápio de demonstração.
import { and, eq, inArray } from 'drizzle-orm';
import {
  ingredient,
  ingredientStock,
  modifier,
  modifierGroup,
  product,
  recipe,
  recipeItem,
  stockMovement,
} from '@/shared/db/schema';
import type { Transaction } from '@/shared/db/transaction';
import {
  type BaseUnit,
  type Id,
  Money,
  newId,
  operationalDate,
  Quantity,
  UnitCost,
} from '@/shared/kernel';

/** [nome, unidade, quantidade comprada (base), valor pago (centavos), mínimo (base)] */
const INGREDIENTS: readonly [string, BaseUnit, string, number, string][] = [
  ['Pão de hambúrguer', 'un', '100', 8000, '20'],
  ['Carne moída', 'g', '5000', 20000, '1000'],
  ['Queijo muçarela', 'g', '2000', 9000, '500'],
  ['Alface', 'g', '1000', 1200, '0'],
  ['Bacon', 'g', '1000', 6000, '200'],
  ['Ovo', 'un', '30', 2400, '6'],
  ['Cheddar', 'g', '1000', 5000, '0'],
  ['Filé de frango', 'g', '5000', 15000, '1000'],
  ['Molho de tomate', 'ml', '2000', 2000, '0'],
  ['Feijão preto', 'g', '5000', 4500, '0'],
  ['Refrigerante lata', 'un', '48', 14400, '12'],
  ['Água mineral', 'un', '48', 7200, '12'],
  ['Laranja', 'un', '50', 2500, '0'],
  ['Leite condensado', 'g', '2000', 4000, '0'],
];

/** Ficha por produto/adicional: [insumo, quantidade na base para 1 unidade vendida] */
const PRODUCT_RECIPES: Readonly<Record<string, readonly [string, string][]>> = {
  'X-Burger': [
    ['Pão de hambúrguer', '1'],
    ['Carne moída', '150'],
    ['Queijo muçarela', '30'],
  ],
  'X-Salada': [
    ['Pão de hambúrguer', '1'],
    ['Carne moída', '120'],
    ['Queijo muçarela', '30'],
    ['Alface', '20'],
  ],
  Parmegiana: [
    ['Filé de frango', '250'],
    ['Queijo muçarela', '80'],
    ['Molho de tomate', '100'],
  ],
  Feijoada: [['Feijão preto', '200']],
  'Refrigerante lata': [['Refrigerante lata', '1']],
  'Água sem gás': [['Água mineral', '1']],
  'Suco natural': [['Laranja', '4']],
  Pudim: [['Leite condensado', '80']],
};

const MODIFIER_RECIPES: Readonly<Record<string, readonly [string, string][]>> = {
  Bacon: [['Bacon', '30']],
  Ovo: [['Ovo', '1']],
  Cheddar: [['Cheddar', '30']],
};

/** Cria insumos, compras e fichas se a empresa ainda não tem insumos. */
export async function seedDemoStock(
  tx: Transaction,
  input: { companyId: Id; stores: readonly Id[]; userId: Id },
): Promise<boolean> {
  const existing = await tx
    .select({ id: ingredient.id })
    .from(ingredient)
    .where(eq(ingredient.companyId, input.companyId))
    .limit(1);
  if (existing.length > 0) return false;

  const now = new Date();
  const day = operationalDate(now, 'America/Sao_Paulo', '05:00');
  const ids = new Map<string, Id>();
  for (const [name, baseUnit, bought, paidCents, minimum] of INGREDIENTS) {
    const id = newId();
    ids.set(name, id);
    await tx.insert(ingredient).values({ id, companyId: input.companyId, name, baseUnit });
    const quantity = Quantity.of(bought, baseUnit);
    const cost = UnitCost.fromTotal(Money.fromCents(paidCents), quantity);
    for (const storeId of input.stores) {
      // Saldo e movimentação juntos, como a entrada do sistema (README B.7.5)
      await tx.insert(ingredientStock).values({
        storeId,
        ingredientId: id,
        quantity: quantity.toDecimalString(),
        avgUnitCost: cost.toDecimalString(),
        minQuantity: Quantity.of(minimum, baseUnit).toDecimalString(),
      });
      await tx.insert(stockMovement).values({
        id: newId(),
        storeId,
        ingredientId: id,
        type: 'ENTRADA',
        quantity: quantity.toDecimalString(),
        unitCost: cost.toDecimalString(),
        valueCents: paidCents,
        balanceAfter: quantity.toDecimalString(),
        note: 'Estoque inicial (demonstração)',
        enteredText: `${bought} ${baseUnit}`,
        originType: 'MANUAL',
        userId: input.userId,
        occurredAt: now,
        operationalDate: day,
      });
    }
  }

  const products = await tx
    .select({ id: product.id, name: product.name })
    .from(product)
    .where(
      and(
        eq(product.companyId, input.companyId),
        inArray(product.name, Object.keys(PRODUCT_RECIPES)),
      ),
    );
  const modifiers = await tx
    .select({ id: modifier.id, name: modifier.name })
    .from(modifier)
    .innerJoin(modifierGroup, eq(modifierGroup.id, modifier.modifierGroupId))
    .where(
      and(
        eq(modifierGroup.companyId, input.companyId),
        inArray(modifier.name, Object.keys(MODIFIER_RECIPES)),
      ),
    );

  const saveRecipe = async (
    owner: { productId: Id } | { modifierId: Id },
    lines: readonly [string, string][],
  ) => {
    const recipeId = newId();
    await tx
      .insert(recipe)
      .values({ id: recipeId, companyId: input.companyId, updatedBy: input.userId, ...owner });
    for (const [name, quantity] of lines) {
      const ingredientId = ids.get(name);
      if (!ingredientId) throw new Error(`insumo ${name} não criado`);
      await tx.insert(recipeItem).values({
        id: newId(),
        recipeId,
        ingredientId,
        quantity: Quantity.of(quantity, 'un').toDecimalString(),
      });
    }
  };
  for (const item of products) {
    await saveRecipe({ productId: item.id }, PRODUCT_RECIPES[item.name] ?? []);
  }
  for (const item of modifiers) {
    await saveRecipe({ modifierId: item.id }, MODIFIER_RECIPES[item.name] ?? []);
  }
  return true;
}
