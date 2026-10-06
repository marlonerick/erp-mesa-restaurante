'use client';

import { useEffect, useRef } from 'react';
import { setPinAction } from '@/modules/auth/interface/actions';
import { FormMessage } from '@/ui/form-message';
import { PasswordField } from '@/ui/password-field';
import { SubmitButton } from '@/ui/submit-button';
import { useServerAction } from '@/ui/use-server-action';

export function PinForm() {
  const [state, action] = useServerAction(setPinAction);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.submittedAt) formRef.current?.reset();
  }, [state?.submittedAt]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <PasswordField
        label="Sua senha"
        name="currentPassword"
        autoComplete="current-password"
        required
        errors={state?.fieldErrors?.currentPassword}
      />
      <PasswordField
        label="Novo PIN"
        name="pin"
        secretName="PIN"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        hint="6 dígitos, sem sequências (123456) nem números repetidos (111111)."
        required
        errors={state?.fieldErrors?.pin}
      />
      <PasswordField
        label="Repita o PIN"
        name="confirmation"
        secretName="PIN"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        required
        errors={state?.fieldErrors?.confirmation}
      />
      <SubmitButton pendingText="Salvando…">Salvar PIN</SubmitButton>
    </form>
  );
}
