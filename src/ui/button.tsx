import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet';

const variants: Record<Variant, string> = {
  primary: 'bg-azulejo text-white hover:bg-azulejo-escuro',
  secondary: 'border-2 border-azulejo bg-white text-azulejo hover:bg-azulejo-claro',
  danger: 'bg-alerta text-white hover:brightness-90',
  quiet: 'text-azulejo underline-offset-4 hover:underline',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
}

/** Botão com alvo de toque de 48 px (acima dos 44 px mínimos) e foco visível. */
export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-base font-semibold transition-colors',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-azulejo',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
