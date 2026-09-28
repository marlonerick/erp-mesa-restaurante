'use client';

import { useActionState } from 'react';
import { changePasswordAction } from '@/modules/auth/interface/actions';
import { TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Senha atual"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        errors={state?.fieldErrors?.currentPassword}
      />
      <TextField
        label="Nova senha"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        hint="Pelo menos 8 caracteres. Evite datas e sequências."
        required
        errors={state?.fieldErrors?.newPassword}
      />
      <TextField
        label="Repita a nova senha"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
        errors={state?.fieldErrors?.confirmation}
      />
      <SubmitButton pendingText="Salvando…">Salvar nova senha</SubmitButton>
    </form>
  );
}
