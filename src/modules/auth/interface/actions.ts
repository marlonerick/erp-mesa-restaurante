'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { type ActionResult, actionFailure, actionSuccess } from '@/shared/errors/action-result';
import { type FormState, formError, formSuccess } from '@/shared/errors/form-state';
import { isPermission, parseId } from '@/shared/kernel';
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
const loginSchema = z.object({
  username: z.string().trim().min(1, 'Informe o usuário.').max(50),
  password: z.string().min(1, 'Informe a senha.').max(128),
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

/** Bloqueio do aparelho compartilhado (manual ou após 3 min sem uso — E2-3). */
export async function lockScreenAction(): Promise<void> {
  await auth().lockScreen(await readSessionToken(), await requestMeta());
  await clearSessionToken();
  redirect('/quem-esta-usando');
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.').max(128),
    newPassword: z.string().min(1, 'Informe a nova senha.').max(128),
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
    currentPassword: z.string().min(1, 'Informe sua senha.').max(128),
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
