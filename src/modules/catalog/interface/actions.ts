'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireSession } from '@/modules/auth/web';
import { type FormState, formError, formSuccess } from '@/shared/errors/form-state';
import {
  type Id,
  isDomainError,
  parseId,
  type RequestContext,
  requireSameStore,
} from '@/shared/kernel';
import { getLogger } from '@/shared/logger/logger';
import { parseModifierPriceText, parsePriceText } from '../domain/rules';
import { catalog } from './service';

// Validação na fronteira (Zod) — formato; as regras de negócio ficam no domínio.

const version = z.coerce.number().int().min(0);
const checkbox = z.literal('on').optional();
const count = z.coerce.number('Informe um número.').int('Informe um número inteiro.');
/** Loja que a tela mostrava: cadastros e disponibilidade usam a loja ativa (RN-CAT-01). */
const expectedStore = { expectedStoreId: z.string().max(40) };

/**
 * Lê a sessão UMA vez, executa e devolve a mensagem de sucesso ou o erro. Em sucesso e em conflito
 * de versão, atualiza as telas (a pessoa já vê os dados novos).
 */
async function run(action: (ctx: RequestContext) => Promise<string>): Promise<FormState> {
  const { context } = await requireSession();
  try {
    const message = await action(context);
    revalidatePath('/', 'layout');
    return formSuccess(message);
  } catch (error) {
    if (isDomainError(error) && error.code === 'CONCURRENT_MODIFICATION') {
      revalidatePath('/', 'layout');
    }
    return formError(error, context.requestId, getLogger());
  }
}

const read = (formData: FormData) => Object.fromEntries(formData);
const ids = (formData: FormData, name: string): Id[] =>
  formData
    .getAll(name)
    .filter((value): value is string => typeof value === 'string')
    .slice(0, 50)
    .map(parseId);

// ---- Categorias ----

export async function createCategoryAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z.object({ name: z.string().max(200), ...expectedStore }).parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    await catalog().createCategory(ctx, { name: input.name });
    return 'Categoria cadastrada.';
  });
}

export async function updateCategoryAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z
      .object({ categoryId: z.string(), version, name: z.string().max(200), active: checkbox })
      .parse(read(formData));
    await catalog().updateCategory(ctx, {
      categoryId: parseId(input.categoryId),
      version: input.version,
      name: input.name,
      active: input.active === 'on',
    });
    return 'Categoria salva.';
  });
}

export async function moveCategoryAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z
      .object({ categoryId: z.string(), direction: z.enum(['UP', 'DOWN']) })
      .parse(read(formData));
    await catalog().moveCategory(ctx, {
      categoryId: parseId(input.categoryId),
      direction: input.direction,
    });
    return 'Ordem alterada.';
  });
}

// ---- Produtos ----

const productSchema = z.object({
  name: z.string().max(200),
  categoryId: z.string().min(1, 'Escolha uma categoria.').max(40),
  sku: z.string().max(60),
  description: z.string().max(1000),
  requiresPreparation: checkbox,
});

function productInput(input: z.infer<typeof productSchema>, formData: FormData) {
  return {
    name: input.name,
    categoryId: parseId(input.categoryId),
    sku: input.sku,
    description: input.description,
    requiresPreparation: input.requiresPreparation === 'on',
    modifierGroupIds: ids(formData, 'modifierGroupIds'),
  };
}

export async function createProductAction(_previous: FormState | null, formData: FormData) {
  let createdId: Id | undefined;
  const state = await run(async (ctx) => {
    const input = productSchema
      .extend({ priceHere: z.string().max(30), ...expectedStore })
      .parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    const priceHere = input.priceHere.trim() === '' ? null : parsePriceText(input.priceHere);
    createdId = (
      await catalog().createProduct(ctx, {
        ...productInput(input, formData),
        priceHereCents: priceHere,
      })
    ).id;
    return 'Produto cadastrado.';
  });
  // Cadastrou: abre o produto (preços nas outras lojas). redirect fica fora do try.
  if (createdId) redirect(`/catalogo/produtos/${createdId}`);
  return state;
}

export async function updateProductAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = productSchema.extend({ productId: z.string(), version }).parse(read(formData));
    await catalog().updateProduct(ctx, {
      ...productInput(input, formData),
      productId: parseId(input.productId),
      version: input.version,
    });
    return 'Produto salvo.';
  });
}

export async function setProductStatusAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z
      .object({ productId: z.string(), version, active: z.enum(['true', 'false']) })
      .parse(read(formData));
    const active = input.active === 'true';
    await catalog().setProductStatus(ctx, {
      productId: parseId(input.productId),
      version: input.version,
      active,
    });
    return active ? 'Produto reativado.' : 'Produto desativado.';
  });
}

const priceRef = { productId: z.string(), storeId: z.string() };

export async function setStorePriceAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z
      .object({
        ...priceRef,
        // Vazio = a tela mostrava "não vende nesta loja"
        version: z.union([z.literal(''), version]),
        price: z.string().max(30),
      })
      .parse(read(formData));
    await catalog().setStorePrice(ctx, {
      productId: parseId(input.productId),
      storeId: parseId(input.storeId),
      priceCents: parsePriceText(input.price),
      version: input.version === '' ? null : input.version,
    });
    return 'Preço salvo.';
  });
}

export async function removeFromStoreAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z.object({ ...priceRef, version }).parse(read(formData));
    await catalog().removeFromStore(ctx, {
      productId: parseId(input.productId),
      storeId: parseId(input.storeId),
      version: input.version,
    });
    return 'O produto deixou de ser vendido nesta loja.';
  });
}

// ---- Disponibilidade (loja ativa) ----

export async function setAvailabilityAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z
      .object({
        productId: z.string(),
        available: z.enum(['true', 'false']),
        ...expectedStore,
      })
      .parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    const available = input.available === 'true';
    const { name } = await catalog().setAvailability(ctx, {
      productId: parseId(input.productId),
      available,
    });
    return available ? `${name} voltou ao cardápio.` : `${name} marcado como esgotado.`;
  });
}

// ---- Adicionais ----

const groupSchema = z.object({
  name: z.string().max(200),
  minSelect: count,
  maxSelect: count,
});

export async function createModifierGroupAction(_previous: FormState | null, formData: FormData) {
  let createdId: Id | undefined;
  const state = await run(async (ctx) => {
    const input = groupSchema.extend(expectedStore).parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    createdId = (await catalog().createModifierGroup(ctx, input)).id;
    return 'Grupo cadastrado.';
  });
  // Cadastrou: abre o grupo para incluir as opções
  if (createdId) redirect(`/catalogo/adicionais/${createdId}`);
  return state;
}

export async function updateModifierGroupAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = groupSchema
      .extend({ groupId: z.string(), version, active: checkbox })
      .parse(read(formData));
    await catalog().updateModifierGroup(ctx, {
      ...input,
      groupId: parseId(input.groupId),
      active: input.active === 'on',
    });
    return 'Grupo salvo.';
  });
}

const modifierSchema = z.object({ name: z.string().max(200), price: z.string().max(30) });

export async function createModifierAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = modifierSchema
      .extend({ groupId: z.string(), ...expectedStore })
      .parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    await catalog().createModifier(ctx, {
      groupId: parseId(input.groupId),
      name: input.name,
      priceDeltaCents: parseModifierPriceText(input.price),
    });
    return 'Opção incluída.';
  });
}

export async function updateModifierAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = modifierSchema
      .extend({ modifierId: z.string(), version, active: checkbox })
      .parse(read(formData));
    await catalog().updateModifier(ctx, {
      modifierId: parseId(input.modifierId),
      version: input.version,
      name: input.name,
      priceDeltaCents: parseModifierPriceText(input.price),
      active: input.active === 'on',
    });
    return 'Opção salva.';
  });
}
