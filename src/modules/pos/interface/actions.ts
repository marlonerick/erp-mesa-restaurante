'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/modules/auth/web';
import { PAYMENT_METHODS } from '@/modules/cashier';
import { type FormState, formError, formSuccess } from '@/shared/errors/form-state';
import {
  formatMoneyText,
  type Id,
  isDomainError,
  parseId,
  parseMoneyText,
  type RequestContext,
  requireSameStore,
} from '@/shared/kernel';
import { getLogger } from '@/shared/logger/logger';
import { parsePercent } from '../domain/rules';
import { pos } from './service';

// Validação na fronteira (Zod) — formato; as regras ficam no domínio (docs/modules/pos.md).

const expectedStore = { expectedStoreId: z.string().max(40) };
const orderScope = { orderId: z.string().max(40), ...expectedStore };
const grant = { grantToken: z.string().max(200).optional() };
const key = { idempotencyKey: z.string().max(64) };

const REFRESH_CODES = [
  'CONCURRENT_MODIFICATION',
  'ORDER_NOT_OPEN',
  'PAYMENTS_STARTED',
  'PAYMENT_EXCEEDS_BALANCE',
];

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
    revalidatePath('/', 'layout');
    return formSuccess(message);
  } catch (error) {
    if (isDomainError(error) && REFRESH_CODES.includes(error.code)) revalidatePath('/', 'layout');
    return formError(error, context.requestId, getLogger());
  }
}

const money = (text: string | undefined) =>
  text === undefined || text.trim() === '' ? null : parseMoneyText(text);
const token = (value: string | undefined) => (value && value !== '' ? value : null);

export async function preBillAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z.object(orderScope).parse(data);
    await pos().preBill(ctx, { orderId: parseId(input.orderId) });
    return 'Pré-conta emitida. A mesa está em pagamento.';
  });
}

/** Valor (R$) ou percentual (%) digitado → centavos ou pontos-base. */
function discountValue(mode: 'VALOR' | 'PERCENTUAL', text: string): number {
  if (mode === 'PERCENTUAL') return parsePercent(text);
  return money(text) ?? -1;
}

const discountSchema = {
  mode: z.enum(['VALOR', 'PERCENTUAL']),
  value: z.string().max(20),
  reason: z.string().max(400),
  ...grant,
  ...orderScope,
};

export async function discountOrderAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z.object(discountSchema).parse(data);
    await pos().discountOrder(ctx, {
      orderId: parseId(input.orderId),
      mode: input.mode,
      value: discountValue(input.mode, input.value),
      reason: input.reason,
      grantToken: token(input.grantToken),
    });
    return 'Desconto na conta aplicado.';
  });
}

export async function discountItemAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z.object({ ...discountSchema, itemId: z.string().max(40) }).parse(data);
    await pos().discountItem(ctx, {
      orderId: parseId(input.orderId),
      itemId: parseId(input.itemId),
      mode: input.mode,
      value: discountValue(input.mode, input.value),
      reason: input.reason,
      grantToken: token(input.grantToken),
    });
    return 'Desconto no item aplicado.';
  });
}

export async function serviceFeeAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z
      .object({
        waived: z.enum(['true', 'false']),
        reason: z.string().max(400),
        ...grant,
        ...orderScope,
      })
      .parse(data);
    const waived = input.waived === 'true';
    await pos().serviceFee(ctx, {
      orderId: parseId(input.orderId),
      waived,
      reason: input.reason,
      grantToken: token(input.grantToken),
    });
    return waived ? 'Taxa de serviço retirada.' : 'Taxa de serviço devolvida.';
  });
}

const itemIds = (formData: FormData): Id[] =>
  formData
    .getAll('itemId')
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .slice(0, 300)
    .map(parseId);

export async function payAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z
      .object({
        method: z.enum(PAYMENT_METHODS, 'Escolha a forma de pagamento.'),
        amount: z.string().max(20).optional(),
        reference: z.string().max(120).optional(),
        ...key,
        ...orderScope,
      })
      .parse(data);
    const result = await pos().pay(ctx, {
      orderId: parseId(input.orderId),
      method: input.method,
      amountCents: money(input.amount),
      reference: input.reference ?? null,
      itemIds: itemIds(formData),
      idempotencyKey: input.idempotencyKey,
    });
    const parts = [`Recebido R$ ${formatMoneyText(result.amountCents)}.`];
    if (result.changeCents > 0) parts.push(`Troco: R$ ${formatMoneyText(result.changeCents)}.`);
    if (result.closed) parts.push('Conta paga e fechada.');
    return parts.join(' ');
  });
}

export async function cancelPaymentAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z
      .object({
        paymentId: z.string().max(40),
        reason: z.string().max(400),
        ...grant,
        ...key,
        ...orderScope,
      })
      .parse(data);
    await pos().cancelPayment(ctx, {
      orderId: parseId(input.orderId),
      paymentId: parseId(input.paymentId),
      reason: input.reason,
      grantToken: token(input.grantToken),
      idempotencyKey: input.idempotencyKey,
    });
    return 'Pagamento cancelado e estornado no caixa.';
  });
}

export async function closeFreeAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z.object(orderScope).parse(data);
    await pos().closeFree(ctx, { orderId: parseId(input.orderId) });
    return 'Conta fechada sem valor (cortesia).';
  });
}
