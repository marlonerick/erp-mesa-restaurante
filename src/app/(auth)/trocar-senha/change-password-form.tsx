'use client';

import { useActionState } from 'react';
import { changePasswordAction } from '@/modules/auth/interface/actions';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/shared/kernel/credentials';
import { FormMessage } from '@/ui/form-message';
import { PasswordField } from '@/ui/password-field';
import { SubmitButton } from '@/ui/submit-button';

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <PasswordField
        label="Senha atual"
        name="currentPassword"
        autoComplete="current-password"
        required
        errors={state?.fieldErrors?.currentPassword}
      />
      <PasswordField
        label="Nova senha"
        name="newPassword"
        autoComplete="new-password"
        hint={`Entre ${String(PASSWORD_MIN_LENGTH)} e ${String(PASSWORD_MAX_LENGTH)} caracteres. Evite datas e sequências.`}
        required
        errors={state?.fieldErrors?.newPassword}
      />
      <PasswordField
        label="Repita a nova senha"
        name="confirmation"
        autoComplete="new-password"
        required
        errors={state?.fieldErrors?.confirmation}
      />
      <SubmitButton pendingText="Salvando…">Salvar nova senha</SubmitButton>
    </form>
  );
}
