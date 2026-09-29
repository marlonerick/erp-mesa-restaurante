// Cardápio FICTÍCIO do seed de desenvolvimento (regra inviolável 8 do README): categorias,
// adicionais e produtos com preços diferentes no Centro e na Praia, para testar a Etapa 4 à mão.
import { eq } from 'drizzle-orm';
import {
  category,
  modifier,
  modifierGroup,
  product,
  productModifierGroup,
  productStore,
} from '@/shared/db/schema';
import type { Transaction } from '@/shared/db/transaction';
import { type Id, newId } from '@/shared/kernel';

const GROUPS = [
  {
    name: 'Ponto da carne',
    minSelect: 1,
    maxSelect: 1,
    options: [
      ['Mal passado', 0],
      ['Ao ponto', 0],
      ['Bem passado', 0],
    ],
  },
  {
    name: 'Extras',
    minSelect: 0,
    maxSelect: 3,
    options: [
      ['Bacon', 500],
      ['Ovo', 300],
      ['Cheddar', 400],
    ],
  },
] as const;

type GroupName = (typeof GROUPS)[number]['name'];

/** [categoria, produto, vai para a cozinha, preço Centro, preço Praia (null = não vende), grupos] */
const PRODUCTS: readonly [string, string, boolean, number, number | null, GroupName[]][] = [
  ['Lanches', 'X-Burger', true, 3200, 3500, ['Ponto da carne', 'Extras']],
  ['Lanches', 'X-Salada', true, 2800, 3000, ['Extras']],
  ['Pratos', 'Parmegiana', true, 5490, 5890, []],
  ['Pratos', 'Feijoada', true, 4990, null, []],
  ['Bebidas', 'Refrigerante lata', false, 700, 800, []],
  ['Bebidas', 'Água sem gás', false, 500, 500, []],
  ['Bebidas', 'Suco natural', true, 1200, 1300, []],
  ['Sobremesas', 'Pudim', true, 1400, 1500, []],
];

/** Cria o cardápio de demonstração se a empresa ainda não tem categorias. */
export async function seedDemoCatalog(
  tx: Transaction,
  input: { companyId: Id; centro: Id; praia: Id },
): Promise<boolean> {
  const existing = await tx
    .select({ id: category.id })
    .from(category)
    .where(eq(category.companyId, input.companyId))
    .limit(1);
  if (existing.length > 0) return false;

  const categoryIds = new Map<string, Id>();
  for (const [index, name] of ['Lanches', 'Pratos', 'Bebidas', 'Sobremesas'].entries()) {
    const id = newId();
    await tx.insert(category).values({ id, companyId: input.companyId, name, sortOrder: index });
    categoryIds.set(name, id);
  }

  const groupIds = new Map<GroupName, Id>();
  for (const group of GROUPS) {
    const id = newId();
    await tx.insert(modifierGroup).values({
      id,
      companyId: input.companyId,
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
    });
    for (const [name, priceDeltaCents] of group.options) {
      await tx.insert(modifier).values({ id: newId(), modifierGroupId: id, name, priceDeltaCents });
    }
    groupIds.set(group.name, id);
  }

  for (const [categoryName, name, requiresPreparation, centro, praia, groups] of PRODUCTS) {
    const id = newId();
    const categoryId = categoryIds.get(categoryName);
    if (!categoryId) throw new Error(`categoria ${categoryName} não criada`);
    await tx
      .insert(product)
      .values({ id, companyId: input.companyId, categoryId, name, requiresPreparation });
    await tx
      .insert(productStore)
      .values({ storeId: input.centro, productId: id, priceCents: centro });
    if (praia !== null) {
      await tx
        .insert(productStore)
        .values({ storeId: input.praia, productId: id, priceCents: praia });
    }
    for (const group of groups) {
      const modifierGroupId = groupIds.get(group);
      if (!modifierGroupId) throw new Error(`grupo ${group} não criado`);
      await tx.insert(productModifierGroup).values({ productId: id, modifierGroupId });
    }
  }
  return true;
}
