'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createUserAction } from '@/modules/users/interface/actions';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/shared/kernel/credentials';
import { TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';
import { RoleCheckboxes } from './role-checkboxes';

export function CreateUserForm() {
  const [state, action] = useActionState(createUserAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.submittedAt) formRef.current?.reset();
  }, [state?.submittedAt]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Nome"
        name="name"
        autoComplete="off"
        required
        errors={state?.fieldErrors?.name}
      />
      <TextField
        label="Usuário de acesso"
        name="username"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        hint="Letras minúsculas, números, ponto, hífen ou sublinhado. Ex.: joao.silva"
        required
        errors={state?.fieldErrors?.username}
      />
      <TextField
        label="Senha provisória"
        name="temporaryPassword"
        type="text"
        autoComplete="off"
        maxLength={PASSWORD_MAX_LENGTH}
        hint={`Entre ${String(PASSWORD_MIN_LENGTH)} e ${String(PASSWORD_MAX_LENGTH)} caracteres. Entregue à pessoa; ela troca no primeiro acesso.`}
        required
        errors={state?.fieldErrors?.temporaryPassword}
      />
      <RoleCheckboxes errors={state?.fieldErrors?.roleCodes} />
      <SubmitButton pendingText="Cadastrando…">Cadastrar usuário</SubmitButton>
    </form>
  );
}
