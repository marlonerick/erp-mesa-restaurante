'use client';

import { useActionState } from 'react';
import { loginAction } from '@/modules/auth/interface/actions';
import { CheckboxField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';

export function LoginForm() {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Usuário"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        errors={state?.fieldErrors?.username}
      />
      <TextField
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        errors={state?.fieldErrors?.password}
      />
      <CheckboxField
        name="sharedDevice"
        label="Este aparelho é compartilhado"
        hint="Tablet ou celular do salão. A tela volta para a troca de usuário após 3 minutos sem uso."
      />
      <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
    </form>
  );
}
