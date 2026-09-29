'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireSession } from '@/modules/auth/web';
import { type FormState, formError, formSuccess } from '@/shared/errors/form-state';
import { type Id, parseId } from '@/shared/kernel';
import { getLogger } from '@/shared/logger/logger';
import { NEGATIVE_STOCK_POLICIES, parsePercentText, TERMINAL_KINDS } from '../domain/rules';
import { orgAdmin } from './service';

// Validação na fronteira (Zod) — formato; as regras de negócio ficam no domínio.

const version = z.coerce.number().int().min(0);
const settingsSchema = {
  timezone: z.string().max(64),
  operationalDayCutoff: z.string().max(5),
  serviceFee: z.string().max(10),
  negativeStockPolicy: z.enum(NEGATIVE_STOCK_POLICIES, 'Escolha uma política de estoque.'),
  maxOpenCashSessions: z.coerce.number('Informe um número.').int('Informe um número inteiro.'),
};
const storeSchema = z.object({
  name: z.string().max(200),
  code: z.string().max(40),
  ...settingsSchema,
});

/**
 * Executa e devolve a mensagem de sucesso ou o erro. Em sucesso, atualiza TODAS as telas (layout
 * inclusive): o menu lateral mostra loja e terminal. Alterações de administração são raras.
 */
async function run(action: () => Promise<string>): Promise<FormState> {
  const session = await requireSession();
  try {
    const message = await action();
    revalidatePath('/', 'layout');
    return formSuccess(message);
  } catch (error) {
    return formError(error, session.context.requestId, getLogger());
  }
}

const read = (formData: FormData) => Object.fromEntries(formData);

function storeInput(input: z.infer<typeof storeSchema>) {
  return {
    name: input.name,
    code: input.code,
    timezone: input.timezone,
    operationalDayCutoff: input.operationalDayCutoff,
    serviceFeeBp: parsePercentText(input.serviceFee),
    negativeStockPolicy: input.negativeStockPolicy,
    maxOpenCashSessions: input.maxOpenCashSessions,
  };
}

// ---- Empresa ----

const companySchema = z.object({
  legalName: z.string().max(300),
  tradeName: z.string().max(300),
  cnpj: z.string().max(30),
});

export async function createCompanyAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = companySchema.parse(read(formData));
    await orgAdmin().createCompany(context, input);
    return 'Empresa cadastrada.';
  });
}

export async function updateCompanyAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = companySchema.extend({ companyId: z.string(), version }).parse(read(formData));
    await orgAdmin().updateCompany(context, { ...input, companyId: parseId(input.companyId) });
    return 'Dados da empresa salvos.';
  });
}

// ---- Lojas ----

export async function createStoreAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  let createdId: Id | undefined;
  const state = await run(async () => {
    const input = storeSchema.extend({ companyId: z.string() }).parse(read(formData));
    createdId = (
      await orgAdmin().createStore(context, {
        companyId: parseId(input.companyId),
        ...storeInput(input),
      })
    ).id;
    return 'Loja cadastrada.';
  });
  // Cadastrou: abre a loja nova (redirect fica fora do try — ele funciona lançando um sinal)
  if (createdId) redirect(`/admin/lojas/${createdId}`);
  return state;
}

export async function updateStoreAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = storeSchema.extend({ storeId: z.string(), version }).parse(read(formData));
    await orgAdmin().updateStore(context, {
      storeId: parseId(input.storeId),
      version: input.version,
      ...storeInput(input),
    });
    return 'Loja salva.';
  });
}

export async function setStoreStatusAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = z
      .object({
        storeId: z.string(),
        version,
        status: z.enum(['ATIVO', 'INATIVO']),
        confirm: z.literal('on').optional(),
      })
      // Desativar exige marcar a confirmação (conferido também no servidor)
      .refine((data) => data.status === 'ATIVO' || data.confirm === 'on', {
        path: ['confirm'],
        message: 'Marque a confirmação para desativar.',
      })
      .parse(read(formData));
    await orgAdmin().setStoreStatus(context, {
      storeId: parseId(input.storeId),
      version: input.version,
      status: input.status,
    });
    return input.status === 'ATIVO' ? 'Loja reativada.' : 'Loja desativada.';
  });
}

// ---- Terminais ----

const terminalSchema = z.object({
  code: z.string().max(40),
  name: z.string().max(120),
  kind: z.enum(TERMINAL_KINDS, 'Escolha o tipo do terminal.'),
});

export async function createTerminalAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    await orgAdmin().createTerminal(context, terminalSchema.parse(read(formData)));
    return 'Terminal cadastrado.';
  });
}

export async function updateTerminalAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = terminalSchema.extend({ terminalId: z.string(), version }).parse(read(formData));
    await orgAdmin().updateTerminal(context, { ...input, terminalId: parseId(input.terminalId) });
    return 'Terminal salvo.';
  });
}

export async function setTerminalActiveAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = z
      .object({ terminalId: z.string(), version, active: z.enum(['true', 'false']) })
      .parse(read(formData));
    const active = input.active === 'true';
    await orgAdmin().setTerminalActive(context, {
      terminalId: parseId(input.terminalId),
      version: input.version,
      active,
    });
    return active ? 'Terminal reativado.' : 'Terminal desativado.';
  });
}

export async function bindTerminalAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = z.object({ terminalId: z.string() }).parse(read(formData));
    await orgAdmin().bindThisDevice(context, { terminalId: parseId(input.terminalId) });
    return 'Pronto: este aparelho agora é este terminal.';
  });
}

export async function unbindTerminalAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = z.object({ terminalId: z.string() }).parse(read(formData));
    await orgAdmin().unbindTerminal(context, { terminalId: parseId(input.terminalId) });
    return 'Aparelho desvinculado do terminal.';
  });
}
