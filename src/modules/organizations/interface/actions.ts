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
/** Loja que a tela mostrava (formulários de dados da loja ativa — achado I-5). */
const expectedStore = { expectedStoreId: z.string().max(40) };

/**
 * Lê a sessão UMA vez, executa e devolve a mensagem de sucesso ou o erro. Em sucesso, atualiza
 * TODAS as telas (layout inclusive: o menu mostra loja e terminal). Em conflito de versão, também
 * atualiza — a tela já volta com os dados novos para a pessoa conferir e salvar de novo.
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

// ---- Empresa (ids explícitos no formulário: não dependem da loja ativa) ----

const companySchema = z.object({
  legalName: z.string().max(300),
  tradeName: z.string().max(300),
  cnpj: z.string().max(30),
});

export async function createCompanyAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    await orgAdmin().createCompany(ctx, companySchema.parse(read(formData)));
    return 'Empresa cadastrada.';
  });
}

export async function updateCompanyAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = companySchema.extend({ companyId: z.string(), version }).parse(read(formData));
    await orgAdmin().updateCompany(ctx, { ...input, companyId: parseId(input.companyId) });
    return 'Dados da empresa salvos.';
  });
}

// ---- Lojas ----

export async function createStoreAction(_previous: FormState | null, formData: FormData) {
  let createdId: Id | undefined;
  const state = await run(async (ctx) => {
    const input = storeSchema.extend({ companyId: z.string() }).parse(read(formData));
    createdId = (
      await orgAdmin().createStore(ctx, {
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
  return run(async (ctx) => {
    const input = storeSchema.extend({ storeId: z.string(), version }).parse(read(formData));
    await orgAdmin().updateStore(ctx, {
      storeId: parseId(input.storeId),
      version: input.version,
      ...storeInput(input),
    });
    return 'Loja salva.';
  });
}

export async function setStoreStatusAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
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
    await orgAdmin().setStoreStatus(ctx, {
      storeId: parseId(input.storeId),
      version: input.version,
      status: input.status,
    });
    return input.status === 'ATIVO' ? 'Loja reativada.' : 'Loja desativada.';
  });
}

// ---- Terminais (dados da LOJA ATIVA: conferem a loja da tela) ----

const terminalSchema = z.object({
  code: z.string().max(40),
  name: z.string().max(120),
  kind: z.enum(TERMINAL_KINDS, 'Escolha o tipo do terminal.'),
  ...expectedStore,
});
const terminalRef = z.object({ terminalId: z.string(), version, ...expectedStore });

export async function createTerminalAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = terminalSchema.parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    await orgAdmin().createTerminal(ctx, input);
    return 'Terminal cadastrado.';
  });
}

export async function updateTerminalAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = terminalSchema.extend({ terminalId: z.string(), version }).parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    await orgAdmin().updateTerminal(ctx, { ...input, terminalId: parseId(input.terminalId) });
    return 'Terminal salvo.';
  });
}

export async function setTerminalActiveAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = terminalRef.extend({ active: z.enum(['true', 'false']) }).parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    const active = input.active === 'true';
    await orgAdmin().setTerminalActive(ctx, {
      terminalId: parseId(input.terminalId),
      version: input.version,
      active,
    });
    return active ? 'Terminal reativado.' : 'Terminal desativado.';
  });
}

export async function bindTerminalAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = terminalRef.parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    await orgAdmin().bindThisDevice(ctx, {
      terminalId: parseId(input.terminalId),
      version: input.version,
    });
    return 'Pronto: este aparelho agora é este terminal.';
  });
}

export async function unbindTerminalAction(_previous: FormState | null, formData: FormData) {
  return run(async (ctx) => {
    const input = terminalRef.parse(read(formData));
    requireSameStore(ctx, input.expectedStoreId);
    await orgAdmin().unbindTerminal(ctx, {
      terminalId: parseId(input.terminalId),
      version: input.version,
    });
    return 'Aparelho desvinculado do terminal.';
  });
}
