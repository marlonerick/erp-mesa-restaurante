'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/modules/auth/web';
import { type FormState, formError, formSuccess } from '@/shared/errors/form-state';
import { isDomainError, parseId, type RequestContext, requireSameStore } from '@/shared/kernel';
import { getLogger } from '@/shared/logger/logger';
import { tables } from './service';

// Validação na fronteira (Zod) — formato; as regras ficam no domínio.

/** Loja que a tela mostrava: mesas são da loja ativa (RN-TAB-01). */
const expectedStore = { expectedStoreId: z.string().max(40) };
const seats = z.coerce.number('Informe um número.').int('Informe um número inteiro.');

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

export async function createTableAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z
      .object({
        number: z.string().max(40),
        area: z.string().max(80),
        seats,
        ...expectedStore,
      })
      .parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    await tables().createTable(ctx, input);
    return 'Mesa cadastrada.';
  });
}

export async function updateTableAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z
      .object({
        tableId: z.string(),
        version: z.coerce.number().int().min(0),
        number: z.string().max(40),
        area: z.string().max(80),
        seats,
        active: z.literal('on').optional(),
        ...expectedStore,
      })
      .parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    await tables().updateTable(ctx, {
      ...input,
      tableId: parseId(input.tableId),
      active: input.active === 'on',
    });
    return 'Mesa salva.';
  });
}

/** Mesa limpa volta a ficar livre (RN-TAB-05). */
export async function releaseTableAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = z.object({ tableId: z.string(), ...expectedStore }).parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    await tables().releaseTable(ctx, { tableId: parseId(input.tableId) });
    return 'Mesa liberada.';
  });
}
