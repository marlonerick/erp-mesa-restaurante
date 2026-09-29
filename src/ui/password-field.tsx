'use client';

import { useEffect, useRef, useState } from 'react';
import { PASSWORD_MAX_LENGTH } from '@/shared/kernel/credentials';
import { TextField, type TextFieldProps } from './field';

export interface PasswordFieldProps extends Omit<TextFieldProps, 'type' | 'trailing'> {
  /** O que o botão mostra/oculta, para o leitor de tela: "senha" ou "PIN". */
  readonly secretName?: string;
}

/**
 * Campo de senha com botão de olho para conferir o que foi digitado. Limita o tamanho no próprio
 * navegador (o servidor confere de novo).
 * Ao enviar o formulário o campo volta a ficar oculto: o navegador não guarda o valor como
 * texto comum e a senha não fica à mostra na tela seguinte.
 */
export function PasswordField({
  secretName = 'senha',
  maxLength = PASSWORD_MAX_LENGTH,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const form = buttonRef.current?.form;
    if (!form) return;
    const hide = () => {
      setVisible(false);
    };
    form.addEventListener('submit', hide);
    return () => {
      form.removeEventListener('submit', hide);
    };
  }, []);

  return (
    <TextField
      {...props}
      maxLength={maxLength}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            setVisible((current) => !current);
          }}
          aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${secretName}`}
          className="flex size-12 items-center justify-center rounded-md text-tinta-suave hover:text-azulejo focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-azulejo"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      }
    />
  );
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-2.2 3.1" />
      <path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
