'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from './button';

/** Botão de envio que se desativa e muda o texto enquanto o servidor responde. */
export function SubmitButton({
  children,
  pendingText,
  ...props
}: ButtonProps & { readonly pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}
