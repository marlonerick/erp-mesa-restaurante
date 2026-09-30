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
import { orders } from './service';

// Validação na fronteira (Zod) — formato; as regras de negócio ficam no domínio.

/** Loja que a tela mostrava: mesas e contas são da loja ativa (RN-ORD-23). */
const expectedStore = { expectedStoreId: z.string().max(40) };
const version = z.coerce.number().int().min(0);
const orderScope = { orderId: z.string().max(40), ...expectedStore };

/**
 * Lê a sessão UMA vez, confere a loja da tela, executa e devolve a mensagem. Em sucesso e em
 * conflito, atualiza as telas (a pessoa já vê a conta como está agora).
 */
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
    revalidatePath('/', 'layout');
    return formSuccess(message);
  } catch (error) {
    if (
      isDomainError(error) &&
      ['CONCURRENT_MODIFICATION', 'ITEMS_CHANGED', 'ORDER_NOT_OPEN'].includes(error.code)
    ) {
      revalidatePath('/', 'layout');
    }
    return formError(error, context.requestId, getLogger());
  }
}

const ids = (formData: FormData, name: string, limit: number): Id[] =>
  formData
    .getAll(name)
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .slice(0, limit)
    .map(parseId);

// ---- Abertura (redireciona para a comanda) ----

export async function openTableAction(_previous: FormState | null, formData: FormData) {
  let orderId: Id | undefined;
  const state = await run(formData, async (ctx, data) => {
    const input = z
      .object({ tableId: z.string().max(40), guests: z.string().max(3), ...expectedStore })
      .parse(data);
    // Vazio = não informado (E6-7); texto que não é número é recusado pelo domínio
    const guests = input.guests.trim() === '' ? null : Number(input.guests);
    const opened = await orders().openTable(ctx, { tableId: parseId(input.tableId), guests });
    orderId = opened.orderId;
    return 'Mesa aberta.';
  });
  if (orderId) redirect(`/salao/comanda/${orderId}`);
  return state;
}

export async function openCounterAction(_previous: FormState | null, formData: FormData) {
  let orderId: Id | undefined;
  const state = await run(formData, async (ctx, data) => {
    const input = z.object({ label: z.string().max(80), ...expectedStore }).parse(data);
    orderId = (await orders().openCounter(ctx, { label: input.label })).orderId;
    return 'Pedido de balcão aberto.';
  });
  if (orderId) redirect(`/salao/comanda/${orderId}`);
  return state;
}

// ---- Itens ----

export async function addItemAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z
      .object({
        ...orderScope,
        productId: z.string().max(40),
        quantity: z.coerce.number('Informe a quantidade.'),
        notes: z.string().max(400).optional(),
      })
      .parse(data);
    await orders().addItem(ctx, {
      orderId: parseId(input.orderId),
      productId: parseId(input.productId),
      quantity: input.quantity,
      modifierIds: ids(formData, 'modifierId', 30),
      notes: input.notes ?? null,
    });
    return 'Item lançado. Envie para a cozinha quando terminar.';
  });
}

export async function removeItemAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z.object({ itemId: z.string().max(40), ...expectedStore }).parse(data);
    await orders().removeItem(ctx, { itemId: parseId(input.itemId) });
    return 'Item removido.';
  });
}

export async function sendRoundAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z.object({ ...orderScope, idempotencyKey: z.string().max(64) }).parse(data);
    const result = await orders().sendRound(ctx, {
      orderId: parseId(input.orderId),
      itemIds: ids(formData, 'itemId', 300),
      idempotencyKey: input.idempotencyKey,
    });
    const parts = [`Rodada ${String(result.roundNumber)} enviada.`];
    if (result.sent > 0) parts.push(`${String(result.sent)} para a cozinha.`);
    if (result.ready > 0) parts.push(`${String(result.ready)} pronto(s) para entregar.`);
    if (result.warnings.length > 0) {
      const names = result.warnings
        .map(
          (item) =>
            `${item.name} (tinha ${formatQuantityText(item.balance)} ${item.unit}, saiu ${formatQuantityText(item.required)} ${item.unit})`,
        )
        .join('; ');
      parts.push(`Atenção: estoque negativo em ${names}. Avise o gerente.`);
    }
    return parts.join(' ');
  });
}

export async function deliverItemAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z.object({ itemId: z.string().max(40), ...expectedStore }).parse(data);
    await orders().deliverItem(ctx, { itemId: parseId(input.itemId) });
    return 'Item entregue.';
  });
}

export async function cancelItemAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z
      .object({
        itemId: z.string().max(40),
        reason: z.string().max(400),
        grantToken: z.string().max(200).optional(),
        ...expectedStore,
      })
      .parse(data);
    await orders().cancelItem(ctx, {
      itemId: parseId(input.itemId),
      reason: input.reason,
      grantToken: input.grantToken && input.grantToken !== '' ? input.grantToken : null,
    });
    return 'Item cancelado.';
  });
}

// ---- Conta e mesas ----

const structural = { ...orderScope, version };

export async function requestBillAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z.object(structural).parse(data);
    await orders().requestBill(ctx, { ...input, orderId: parseId(input.orderId) });
    return 'Conta pedida. O caixa já vê a mesa como "Pediu a conta".';
  });
}

export async function transferAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z
      .object({ ...structural, fromTableId: z.string().max(40), toTableId: z.string().max(40) })
      .parse(data);
    await orders().transfer(ctx, {
      orderId: parseId(input.orderId),
      version: input.version,
      fromTableId: parseId(input.fromTableId),
      toTableId: parseId(input.toTableId),
    });
    return 'Conta transferida.';
  });
}

export async function joinAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z.object({ ...structural, tableId: z.string().max(40) }).parse(data);
    await orders().join(ctx, {
      orderId: parseId(input.orderId),
      version: input.version,
      tableId: parseId(input.tableId),
    });
    return 'Mesas juntadas nesta conta.';
  });
}

export async function detachAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z.object({ ...structural, tableId: z.string().max(40) }).parse(data);
    await orders().detach(ctx, {
      orderId: parseId(input.orderId),
      version: input.version,
      tableId: parseId(input.tableId),
    });
    return 'Mesa separada da conta.';
  });
}

export async function cancelOrderAction(_previous: FormState | null, formData: FormData) {
  const outcome = { cancelled: false };
  const state = await run(formData, async (ctx, data) => {
    const input = z.object({ ...structural, reason: z.string().max(400).optional() }).parse(data);
    await orders().cancelOrder(ctx, {
      orderId: parseId(input.orderId),
      version: input.version,
      reason: input.reason ?? null,
    });
    outcome.cancelled = true;
    return 'Conta cancelada.';
  });
  if (outcome.cancelled) redirect('/salao');
  return state;
}
