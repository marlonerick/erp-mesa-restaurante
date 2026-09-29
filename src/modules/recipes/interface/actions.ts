'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/modules/auth/web';
import { type FormState, formError, formSuccess } from '@/shared/errors/form-state';
import { isDomainError, parseId } from '@/shared/kernel';
import { getLogger } from '@/shared/logger/logger';
import { MAX_RECIPE_LINES } from '../domain/rules';
import { recipes } from './service';

/** Salva a ficha inteira: linhas vêm em pares (insumo, quantidade), na ordem da tela. */
export async function saveRecipeAction(
  _previous: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const { context } = await requireSession();
  try {
    const input = z
      .object({
        kind: z.enum(['PRODUCT', 'MODIFIER']),
        id: z.string(),
        // Vazio = a tela mostrava "sem ficha"
        version: z.union([z.literal(''), z.coerce.number().int().min(0)]),
      })
      .parse(Object.fromEntries(formData));
    const texts = (name: string) =>
      formData
        .getAll(name)
        .filter((value): value is string => typeof value === 'string')
        .slice(0, MAX_RECIPE_LINES + 1);
    const ingredientIds = texts('ingredientId');
    const quantities = texts('quantity');
    const lines = ingredientIds
      .map((id, index) => ({ id, quantity: quantities[index] ?? '' }))
      // Linha deixada em branco na tela é ignorada
      .filter((line) => line.id !== '' || line.quantity.trim() !== '')
      .map((line) => ({ ingredientId: parseId(line.id), quantity: line.quantity.slice(0, 20) }));
    await recipes().saveRecipe(context, {
      kind: input.kind,
      id: parseId(input.id),
      version: input.version === '' ? null : input.version,
      lines,
    });
    revalidatePath('/', 'layout');
    return formSuccess('Ficha técnica salva.');
  } catch (error) {
    if (isDomainError(error) && error.code === 'CONCURRENT_MODIFICATION') {
      revalidatePath('/', 'layout');
    }
    return formError(error, context.requestId, getLogger());
  }
}
