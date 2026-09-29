'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireSession } from '@/modules/auth/web';
import { type FormState, formError, formSuccess } from '@/shared/errors/form-state';
import {
  formatQuantityText,
  type Id,
  isDomainError,
  parseId,
  type RequestContext,
  requireSameStore,
} from '@/shared/kernel';
import { getLogger } from '@/shared/logger/logger';
import type { StockShortage } from '../application/inventory';
import { inventory } from './service';

// Validação na fronteira (Zod) — formato; as regras ficam no domínio.

const version = z.coerce.number().int().min(0);
/** Loja da tela: saldo, mínimo e cadastros usam a loja ativa (RN-INV-01). */
const expectedStore = { expectedStoreId: z.string().max(40) };
const amount = {
  ingredientId: z.string().max(40),
  quantity: z.string().max(20),
  unit: z.string().max(40),
  ...expectedStore,
};

/** Lê a sessão uma vez, executa e devolve sucesso/erro; atualiza as telas. */
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

/** "Lançado. Atenção: Queijo ficou com saldo negativo." (política permitir com alerta). */
function withWarnings(message: string, warnings: readonly StockShortage[]): string {
  if (warnings.length === 0) return message;
  const names = warnings
    .map(
      (item) =>
        `${item.name} (tinha ${formatQuantityText(item.balance)} ${item.unit}, saiu ${formatQuantityText(item.required)} ${item.unit})`,
    )
    .join('; ');
  return `${message} Atenção: saldo negativo em ${names}. Confira o estoque.`;
}

// ---- Cadastro ----

export async function createIngredientAction(_previous: FormState | null, formData: FormData) {
  let createdId: Id | undefined;
  const state = await run(async (ctx) => {
    const input = z
      .object({ name: z.string().max(200), baseUnit: z.string().max(5), ...expectedStore })
      .parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    createdId = (await inventory().createIngredient(ctx, input)).id;
    return 'Insumo cadastrado.';
  });
  if (createdId) redirect(`/estoque/${createdId}`);
  return state;
}

export async function updateIngredientAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z
      .object({
        ingredientId: z.string(),
        version,
        name: z.string().max(200),
        active: z.literal('on').optional(),
      })
      .parse(read(formData));
    await inventory().updateIngredient(ctx, {
      ingredientId: parseId(input.ingredientId),
      version: input.version,
      name: input.name,
      active: input.active === 'on',
    });
    return 'Insumo salvo.';
  });
}

export async function addConversionAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z
      .object({
        ingredientId: z.string(),
        unitName: z.string().max(60),
        factor: z.string().max(20),
      })
      .parse(read(formData));
    await inventory().addConversion(ctx, { ...input, ingredientId: parseId(input.ingredientId) });
    return 'Unidade incluída.';
  });
}

export async function removeConversionAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z.object({ conversionId: z.string() }).parse(read(formData));
    await inventory().removeConversion(ctx, { conversionId: parseId(input.conversionId) });
    return 'Unidade excluída.';
  });
}

// ---- Loja ativa: mínimo e movimentações ----

export async function setMinimumAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z
      .object({ ingredientId: z.string(), minimum: z.string().max(20), ...expectedStore })
      .parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    await inventory().setMinimum(ctx, {
      ingredientId: parseId(input.ingredientId),
      minimum: input.minimum,
    });
    return 'Estoque mínimo salvo.';
  });
}

export async function entryAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z
      .object({ ...amount, paid: z.string().max(30), note: z.string().max(400) })
      .parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    const { warnings } = await inventory().registerEntry(ctx, {
      ...input,
      ingredientId: parseId(input.ingredientId),
    });
    return withWarnings('Entrada lançada.', warnings);
  });
}

export async function exitAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z.object({ ...amount, note: z.string().max(400) }).parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    const { warnings } = await inventory().registerExit(ctx, {
      ...input,
      ingredientId: parseId(input.ingredientId),
    });
    return withWarnings('Saída lançada.', warnings);
  });
}

export async function lossAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z
      .object({ ...amount, reason: z.string().max(30), note: z.string().max(400) })
      .parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    const { warnings } = await inventory().registerLoss(ctx, {
      ...input,
      ingredientId: parseId(input.ingredientId),
    });
    return withWarnings('Perda lançada.', warnings);
  });
}

export async function countAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z.object(amount).parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    const { adjusted } = await inventory().registerCount(ctx, {
      ...input,
      ingredientId: parseId(input.ingredientId),
    });
    return adjusted ? 'Contagem registrada: saldo ajustado.' : 'Contagem confere com o saldo.';
  });
}
