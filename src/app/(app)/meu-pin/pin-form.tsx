'use client';

import { useActionState, useEffect, useRef } from 'react';
import { setPinAction } from '@/modules/auth/interface/actions';
import { TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';

export function PinForm() {
  const [state, action] = useActionState(setPinAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.submittedAt) formRef.current?.reset();
  }, [state?.submittedAt]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Sua senha"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        errors={state?.fieldErrors?.currentPassword}
      />
      <TextField
        label="Novo PIN"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        hint="6 dígitos, sem sequências (123456) nem números repetidos (111111)."
        required
        errors={state?.fieldErrors?.pin}
      />
      <TextField
        label="Repita o PIN"
        name="confirmation"
        type="password"
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
