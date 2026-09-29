'use client';

import { type FormHTMLAttributes, useEffect, useRef } from 'react';
import type { FormState } from '@/shared/errors/form-state';
import { cn } from './cn';

interface Props extends Omit<FormHTMLAttributes<HTMLFormElement>, 'action'> {
  readonly action: (formData: FormData) => void;
  readonly state: FormState | null;
  /** Formulário de CADASTRO: limpa os campos depois de salvar com sucesso. */
  readonly resetOnSuccess?: boolean;
}

/**
 * Formulário ligado a uma Server Action. O React 19 limpa os campos depois de CADA envio — até
 * quando o servidor recusa, e a pessoa perderia o que digitou. Aqui a limpeza automática é
 * cancelada; só limpamos de propósito, após um cadastro bem-sucedido.
 */
export function ActionForm({
  action,
  state,
  resetOnSuccess,
  noValidate = true,
  className,
  children,
  ...props
}: Props) {
  const form = useRef<HTMLFormElement>(null);
  const allowReset = useRef(false);

  useEffect(() => {
    if (!resetOnSuccess || !state?.submittedAt) return;
    allowReset.current = true;
    form.current?.reset();
    allowReset.current = false;
  }, [resetOnSuccess, state?.submittedAt]);

  return (
    <form
      ref={form}
      action={action}
      noValidate={noValidate}
      onReset={(event) => {
        if (!allowReset.current) event.preventDefault();
      }}
      className={cn('flex flex-col gap-5', className)}
      {...props}
    >
      {children}
    </form>
  );
}
