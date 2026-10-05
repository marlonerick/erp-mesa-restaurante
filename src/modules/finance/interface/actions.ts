'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/modules/auth/web';
import { type FormState, formError, formSuccess } from '@/shared/errors/form-state';
import {
  isDomainError,
  parseId,
  parseMoneyText,
  type RequestContext,
  requireSameStore,
} from '@/shared/kernel';
import { getLogger } from '@/shared/logger/logger';
import { FINANCE_TYPES } from '../domain/rules';
import { finance } from './service';

// Validação na fronteira (Zod) — formato; as regras ficam no domínio (docs/modules/finance.md).

const expectedStore = { expectedStoreId: z.string().max(40) };
const date = z.string().max(10);
const typeField = z.enum(FINANCE_TYPES, 'Escolha receita ou despesa.');

/** Lê a sessão UMA vez, confere a loja da tela (STORE_CHANGED), executa e atualiza as telas. */
async function run(
  formData: FormData,
  action: (ctx: RequestContext, data: Record<string, FormDataEntryValue>) => Promise<string>,
): Promise<FormState> {
  const { context } = await requireSession();
  try {
    const data = Object.fromEntries(formData);
    const { expectedStoreId } = z.object(expectedStore).parse(data);
    requireSameStore(context, expectedStoreId);
    const message = await action(context, data);
    revalidatePath('/financeiro');
    return formSuccess(message);
  } catch (error) {
    if (isDomainError(error) && error.code === 'CONCURRENT_MODIFICATION') {
      revalidatePath('/financeiro');
    }
    return formError(error, context.requestId, getLogger());
  }
}

export async function createEntryAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z
      .object({
        type: typeField,
        categoryId: z.string().max(40),
        description: z.string().max(400),
        amount: z.string().max(20),
        competenceDate: date,
        status: z.enum(['PAGO', 'PREVISTO'], 'Diga se já foi pago ou se está a pagar.'),
        date,
        idempotencyKey: z.string().max(64),
        ...expectedStore,
      })
      .parse(data);
    await finance().createEntry(ctx, {
      type: input.type,
      categoryId: parseId(input.categoryId),
      description: input.description,
      amountCents: parseMoneyText(input.amount),
      // Sem competência informada, vale a data do pagamento ou do vencimento
      competenceDate: input.competenceDate.trim() === '' ? input.date : input.competenceDate,
      status: input.status,
      date: input.date,
      idempotencyKey: input.idempotencyKey,
    });
    return input.type === 'RECEITA' ? 'Receita lançada.' : 'Despesa lançada.';
  });
}

export async function payEntryAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z
      .object({
        entryId: z.string().max(40),
        version: z.coerce.number().int().min(0),
        paidDate: date,
        ...expectedStore,
      })
      .parse(data);
    await finance().payEntry(ctx, {
      entryId: parseId(input.entryId),
      version: input.version,
      paidDate: input.paidDate,
    });
    return 'Pagamento registrado.';
  });
}

export async function cancelEntryAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z
      .object({
        entryId: z.string().max(40),
        version: z.coerce.number().int().min(0),
        reason: z.string().max(400),
        ...expectedStore,
      })
      .parse(data);
    await finance().cancelEntry(ctx, {
      entryId: parseId(input.entryId),
      version: input.version,
      reason: input.reason,
    });
    return 'Lançamento cancelado.';
  });
}

export async function createCategoryAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z
      .object({ type: typeField, name: z.string().max(200), ...expectedStore })
      .parse(data);
    await finance().createCategory(ctx, { type: input.type, name: input.name });
    return 'Categoria criada.';
  });
}

export async function setCategoryActiveAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z
      .object({
        categoryId: z.string().max(40),
        version: z.coerce.number().int().min(0),
        active: z.enum(['1', '0']),
        ...expectedStore,
      })
      .parse(data);
    await finance().setCategoryActive(ctx, {
      categoryId: parseId(input.categoryId),
      version: input.version,
      active: input.active === '1',
    });
    return input.active === '1' ? 'Categoria reativada.' : 'Categoria desativada.';
  });
}
