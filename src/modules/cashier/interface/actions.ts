'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireSession } from '@/modules/auth/web';
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
import { PAYMENT_METHODS, type PaymentMethod } from '../domain/rules';
import { cashier } from './service';

// Validação na fronteira (Zod) — formato; as regras ficam no domínio (docs/modules/cashier.md).

const expectedStore = { expectedStoreId: z.string().max(40) };
const key = { idempotencyKey: z.string().max(64) };

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
    if (isDomainError(error) && error.code === 'CONCURRENT_MODIFICATION') {
      revalidatePath('/', 'layout');
    }
    return formError(error, context.requestId, getLogger());
  }
}

/** "150,00" → centavos; vazio ou inválido = null (o domínio recusa com a mensagem certa). */
const money = (text: string | undefined) =>
  text === undefined || text.trim() === '' ? null : parseMoneyText(text);

export async function openCashAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z.object({ opening: z.string().max(20), ...key, ...expectedStore }).parse(data);
    const openingCents = money(input.opening);
    await cashier().open(ctx, { openingCents, idempotencyKey: input.idempotencyKey });
    return `Caixa aberto com R$ ${formatMoneyText(openingCents ?? 0)} de fundo de troco.`;
  });
}

export async function cashMovementAction(_previous: FormState | null, formData: FormData) {
  return run(formData, async (ctx, data) => {
    const input = z
      .object({
        type: z.enum(['SANGRIA', 'SUPRIMENTO'], 'Escolha sangria ou suprimento.'),
        amount: z.string().max(20),
        reason: z.string().max(400),
        ...key,
        ...expectedStore,
      })
      .parse(data);
    await cashier().movement(ctx, {
      type: input.type,
      amountCents: money(input.amount),
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
    return input.type === 'SANGRIA' ? 'Sangria registrada.' : 'Suprimento registrado.';
  });
}

export async function closeCashAction(_previous: FormState | null, formData: FormData) {
  let closedId: Id | undefined;
  const state = await run(formData, async (ctx, data) => {
    const input = z
      .object({
        sessionId: z.string().max(40),
        version: z.coerce.number().int().min(0),
        ...Object.fromEntries(
          PAYMENT_METHODS.map((method) => [method, z.string().max(20).optional()]),
        ),
        ...key,
        ...expectedStore,
      })
      .parse(data) as Record<string, string | number | undefined>;
    const declared: Partial<Record<PaymentMethod, number | null>> = {};
    for (const method of PAYMENT_METHODS) {
      const text = input[method];
      // Dinheiro em branco = não informado (o domínio exige); outras formas são opcionais (Q-16)
      if (typeof text === 'string' && text.trim() !== '') declared[method] = money(text) ?? -1;
    }
    const result = await cashier().close(ctx, {
      sessionId: parseId(String(input.sessionId)),
      version: Number(input.version),
      declared,
      idempotencyKey: String(input.idempotencyKey),
    });
    closedId = result.sessionId;
    return 'Caixa fechado.';
  });
  // Fechou: mostra as diferenças (só agora — fechamento cego, RN-CASH-06)
  if (closedId) redirect(`/caixa/${closedId}`);
  return state;
}
