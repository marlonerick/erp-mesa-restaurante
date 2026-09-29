'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { type ActionResult, actionFailure, actionSuccess } from '@/shared/errors/action-result';
import { type FormState, formError, formSuccess } from '@/shared/errors/form-state';
import { isDomainError, isPermission, PASSWORD_MAX_LENGTH, parseId } from '@/shared/kernel';
import { getLogger } from '@/shared/logger/logger';
import {
  clearSessionToken,
  readDeviceToken,
  readSessionToken,
  writeDeviceToken,
  writeSessionToken,
} from './cookies';
import { auth, requestMeta, requireSession } from './current-session';

// Validação na fronteira (Zod) — docs/api/convencoes.md. Mensagens em português.
const PASSWORD_TOO_LONG = `A senha tem no máximo ${String(PASSWORD_MAX_LENGTH)} caracteres.`;

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Informe o usuário.').max(50),
  password: z.string().min(1, 'Informe a senha.').max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG),
  sharedDevice: z.literal('on').optional(),
});

export async function loginAction(
  _previous: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const meta = await requestMeta();
  let mustChangePassword: boolean;
  try {
    const input = loginSchema.parse(Object.fromEntries(formData));
    const result = await auth().login(
      {
        username: input.username,
        password: input.password,
        sharedDevice: input.sharedDevice === 'on',
        deviceToken: await readDeviceToken(),
      },
      meta,
    );
    await writeDeviceToken(result.deviceToken);
    await writeSessionToken(result.sessionToken);
    mustChangePassword = result.mustChangePassword;
  } catch (error) {
    return formError(error, meta.requestId, getLogger());
  }
  // redirect() funciona lançando um sinal especial: fica fora do try/catch
  redirect(mustChangePassword ? '/trocar-senha' : '/inicio');
}

const switchSchema = z.object({
  userId: z.uuid('Escolha um usuário.'),
  pin: z.string().regex(/^\d{6}$/, 'O PIN tem 6 dígitos.'),
});

export async function switchUserAction(
  _previous: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const meta = await requestMeta();
  try {
    const input = switchSchema.parse(Object.fromEntries(formData));
    const { sessionToken } = await auth().switchUser(
      { deviceToken: await readDeviceToken(), userId: parseId(input.userId), pin: input.pin },
      meta,
    );
    await writeSessionToken(sessionToken);
  } catch (error) {
    return formError(error, meta.requestId, getLogger());
  }
  redirect('/inicio');
}

export async function logoutAction(): Promise<void> {
  await auth().logout(await readSessionToken(), await requestMeta());
  await clearSessionToken();
  redirect('/login');
}

/**
 * Troca de loja em 1 clique (RN-ORG-12). Volta para o início: a tela atual pode ser de um registro
 * que não existe na outra loja. Loja sem acesso: fica onde está (a sessão não muda).
 */
export async function switchStoreAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = z.object({ storeId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (parsed.success) {
    try {
      await auth().switchStore(session.context, parseId(parsed.data.storeId));
    } catch (error) {
      if (!isDomainError(error)) throw error;
      getLogger().warn(
        { code: error.code, requestId: session.context.requestId },
        'Troca de loja recusada',
      );
    }
  }
  redirect('/inicio');
}

/** Bloqueio do aparelho compartilhado (manual ou após 3 min sem uso — E2-3). */
export async function lockScreenAction(): Promise<void> {
  await auth().lockScreen(await readSessionToken(), await requestMeta());
  await clearSessionToken();
  redirect('/quem-esta-usando');
}

const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Informe a senha atual.')
      .max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG),
    newPassword: z
      .string()
      .min(1, 'Informe a nova senha.')
      .max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG),
    confirmation: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmation, {
    path: ['confirmation'],
    message: 'A confirmação não confere com a nova senha.',
  });

export async function changePasswordAction(
  _previous: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession({ allowPasswordChange: true });
  try {
    const input = changePasswordSchema.parse(Object.fromEntries(formData));
    await auth().changeOwnPassword(session.context, input);
  } catch (error) {
    return formError(error, session.context.requestId, getLogger());
  }
  redirect('/inicio');
}

const pinSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Informe sua senha.')
      .max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG),
    pin: z.string().regex(/^\d{6}$/, 'O PIN tem 6 dígitos.'),
    confirmation: z.string(),
  })
  .refine((data) => data.pin === data.confirmation, {
    path: ['confirmation'],
    message: 'A confirmação não confere com o PIN.',
  });

export async function setPinAction(
  _previous: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  try {
    const input = pinSchema.parse(Object.fromEntries(formData));
    await auth().setOwnPin(session.context, {
      currentPassword: input.currentPassword,
      pin: input.pin,
    });
    return formSuccess('PIN salvo. Use-o para trocar de usuário e autorizar ações.');
  } catch (error) {
    return formError(error, session.context.requestId, getLogger());
  }
}

const elevationSchema = z.object({
  authorizerUsername: z.string().trim().min(1).max(50),
  pin: z.string().regex(/^\d{6}$/),
  permission: z.string().refine(isPermission, 'Permissão desconhecida.'),
});

/** Autorização do gerente (RN-AUTHZ-06). O token volta para a tela anexar à ação sensível. */
export async function requestElevationAction(
  input: z.input<typeof elevationSchema>,
): Promise<ActionResult<{ grantToken: string; expiresAt: string }>> {
  const session = await requireSession();
  try {
    const parsed = elevationSchema.parse(input);
    if (!isPermission(parsed.permission)) throw new Error('permissão inválida');
    const grant = await auth().requestElevation(session.context, {
      authorizerUsername: parsed.authorizerUsername,
      pin: parsed.pin,
      permission: parsed.permission,
    });
    return actionSuccess({
      grantToken: grant.grantToken,
      expiresAt: grant.expiresAt.toISOString(),
    });
  } catch (error) {
    return actionFailure(error, session.context.requestId, getLogger());
  }
}
