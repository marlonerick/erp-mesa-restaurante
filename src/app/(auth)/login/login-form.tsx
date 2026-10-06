'use client';

import { loginAction } from '@/modules/auth/interface/actions';
import { CheckboxField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { PasswordField } from '@/ui/password-field';
import { SubmitButton } from '@/ui/submit-button';
import { useServerAction } from '@/ui/use-server-action';

export function LoginForm() {
  const [state, action] = useServerAction(loginAction);
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
      <PasswordField
        label="Senha"
        name="password"
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
