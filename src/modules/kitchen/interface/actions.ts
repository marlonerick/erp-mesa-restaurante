'use server';

import { z } from 'zod';
import { requireSession } from '@/modules/auth/web';
import { type FormState, formError, formSuccess } from '@/shared/errors/form-state';
import { parseId, type RequestContext, requireSameStore } from '@/shared/kernel';
import { getLogger } from '@/shared/logger/logger';
import { kitchen } from './service';

// Validação na fronteira (Zod) — formato; as regras ficam no domínio. A tela da cozinha se
// atualiza pela leitura automática (ADR-0005): não precisa redesenhar a página no servidor.

const expectedStore = { expectedStoreId: z.string().max(40) };
const itemInput = z.object({ itemId: z.string().max(40), ...expectedStore });

/** Lê a sessão UMA vez, confere a loja da tela (STORE_CHANGED), executa e devolve a mensagem. */
async function run(
  formData: FormData,
  action: (ctx: RequestContext, data: Record<string, FormDataEntryValue>) => Promise<string>,
): Promise<FormState> {
  const { context } = await requireSession();
  try {
    const data = Object.fromEntries(formData);
    const { expectedStoreId } = z.object(expectedStore).parse(data);
    requireSameStore(context, expectedStoreId);
    return formSuccess(await action(context, data));
  } catch (error) {
    return formError(error, context.requestId, getLogger());
  }
}

export async function startItemAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const { itemId } = itemInput.parse(data);
    const { changed } = await kitchen().startItem(ctx, { itemId: parseId(itemId) });
    return changed ? 'Preparando.' : 'Já estava em preparo.';
  });
}

export async function readyItemAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const { itemId } = itemInput.parse(data);
    const { changed } = await kitchen().readyItem(ctx, { itemId: parseId(itemId) });
    return changed ? 'Pronto. O garçom já vê no celular.' : 'Já estava pronto.';
  });
}

export async function readyTicketAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const { ticketId } = z.object({ ticketId: z.string().max(40), ...expectedStore }).parse(data);
    const { changed } = await kitchen().readyTicket(ctx, { ticketId: parseId(ticketId) });
    return changed > 0
      ? `Tudo pronto: ${String(changed)} item(ns). O garçom já vê no celular.`
      : 'Já estava tudo pronto.';
  });
}

export async function undoReadyAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const { itemId } = itemInput.parse(data);
    const { changed } = await kitchen().undoReady(ctx, { itemId: parseId(itemId) });
    return changed
      ? 'Desfeito: o item voltou para "Preparando".'
      : 'Este item já não estava pronto.';
  });
}
