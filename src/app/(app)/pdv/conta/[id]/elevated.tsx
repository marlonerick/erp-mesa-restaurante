'use client';

import { type SyntheticEvent, useState, useTransition } from 'react';
import { requestElevationAction } from '@/modules/auth/interface/actions';
import type { FormState } from '@/shared/errors/form-state';
import type { Permission } from '@/shared/kernel';
import { TextField } from '@/ui/field';
import { useServerAction } from '@/ui/use-server-action';

const text = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
};

/**
 * Formulário que pode precisar do PIN do gerente (autorização elevada — RN-AUTHZ-06): se precisar,
 * pede a autorização primeiro e manda só o token de uso único para a ação (o PIN não segue).
 */
export function useElevatedForm(
  action: (previous: FormState | null, formData: FormData) => Promise<FormState>,
  permission: Permission,
) {
  const [state, run, running] = useServerAction(action);
  const [authorizing, startTransition] = useTransition();
  const [authError, setAuthError] = useState<string | null>(null);

  const submit = (event: SyntheticEvent<HTMLFormElement>, needsManager: boolean) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAuthError(null);
    startTransition(async () => {
      if (needsManager) {
        const grant = await requestElevationAction({
          authorizerUsername: text(data, 'authorizer'),
          pin: text(data, 'pin'),
          permission,
        });
        if (!grant.ok) {
          setAuthError(grant.error.message);
          return;
        }
        data.set('grantToken', grant.data.grantToken);
      }
      data.delete('pin');
      data.delete('authorizer');
      run(data);
    });
  };

  return { state, submit, pending: authorizing || running, authError };
}

/** Usuário e PIN do gerente, digitados no aparelho de quem pede. */
export function ManagerFields({ reason }: { readonly reason: string }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-md border-2 border-atencao bg-atencao-claro p-4">
      <legend className="px-1 font-semibold text-atencao">Autorização do gerente</legend>
      <p className="text-sm text-atencao">{reason}</p>
      <TextField
        label="Usuário do gerente"
        name="authorizer"
        autoComplete="off"
        autoCapitalize="none"
        required
      />
      <TextField
        label="PIN do gerente"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        required
      />
    </fieldset>
  );
}
