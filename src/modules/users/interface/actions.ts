'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/modules/auth/web';
import { type FormState, formError, formSuccess } from '@/shared/errors/form-state';
import { PASSWORD_MAX_LENGTH, parseId, requireSameStore, SYSTEM_ROLES } from '@/shared/kernel';
import { getLogger } from '@/shared/logger/logger';
import { usersAdmin } from './service';

const USERS_PAGE = '/admin/usuarios';
const PASSWORD_TOO_LONG = `A senha tem no máximo ${String(PASSWORD_MAX_LENGTH)} caracteres.`;

const roleCodes = z.array(z.enum(SYSTEM_ROLES)).min(1, 'Escolha ao menos um perfil.');

/** Lê o formulário mantendo campos repetidos (perfis) como lista. */
function read(formData: FormData) {
  return { ...Object.fromEntries(formData), roleCodes: formData.getAll('roleCodes') };
}

async function run(action: () => Promise<string>): Promise<FormState> {
  const session = await requireSession();
  try {
    const message = await action();
    revalidatePath(USERS_PAGE);
    return formSuccess(message);
  } catch (error) {
    return formError(error, session.context.requestId, getLogger());
  }
}

const createSchema = z.object({
  name: z.string().max(120),
  username: z.string().max(50),
  temporaryPassword: z.string().max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG),
  roleCodes,
  expectedStoreId: z.string().max(40),
});

export async function createUserAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = createSchema.parse(read(formData));
    // Os perfis valem para a loja ativa: se ela mudou em outra aba, recusa (achado I-5)
    requireSameStore(context, input.expectedStoreId);
    await usersAdmin().create(context, input);
    return `Usuário ${input.username.trim().toLowerCase()} criado. Entregue a senha provisória a ele.`;
  });
}

const renameSchema = z.object({ userId: z.uuid(), name: z.string().max(120) });

export async function renameUserAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = renameSchema.parse(read(formData));
    await usersAdmin().rename(context, { userId: parseId(input.userId), name: input.name });
    return 'Nome atualizado.';
  });
}

const rolesSchema = z.object({ userId: z.uuid(), roleCodes, expectedStoreId: z.string().max(40) });

export async function setUserRolesAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = rolesSchema.parse(read(formData));
    requireSameStore(context, input.expectedStoreId);
    await usersAdmin().setRoles(context, {
      userId: parseId(input.userId),
      roleCodes: input.roleCodes,
    });
    return 'Perfis atualizados.';
  });
}

const resetSchema = z.object({
  userId: z.uuid(),
  temporaryPassword: z.string().max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG),
});

export async function resetPasswordAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = resetSchema.parse(read(formData));
    await usersAdmin().resetPassword(context, {
      userId: parseId(input.userId),
      temporaryPassword: input.temporaryPassword,
    });
    return 'Senha provisória definida. As sessões do usuário foram encerradas.';
  });
}

const disableSchema = z.object({ userId: z.uuid() });

export async function disableUserAction(_previous: FormState | null, formData: FormData) {
  const { context } = await requireSession();
  return run(async () => {
    const input = disableSchema.parse(read(formData));
    await usersAdmin().disable(context, { userId: parseId(input.userId) });
    return 'Usuário desativado. As sessões dele foram encerradas.';
  });
}
