'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';
import { ICONS } from './icons';

// Janela no padrão do shadcn/ui (E6-5), sobre o Radix Dialog: foco preso dentro da janela, Esc
// fecha, o foco volta ao botão que abriu e o leitor de tela anuncia título e descrição. No celular
// ela sobe de baixo (folha), mais perto do polegar; no tablet/computador fica no centro.

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  readonly title: string;
  readonly description?: ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-tinta/50" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto bg-white p-5 shadow-xl',
          'inset-x-0 bottom-0 rounded-t-2xl',
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
          'focus-visible:outline-3 focus-visible:outline-azulejo',
          className,
        )}
        // Sem descrição, o Radix exige dizer isso explicitamente
        {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        {...props}
      >
        <div className="flex items-start justify-between gap-3">
          <DialogPrimitive.Title className="text-2xl font-bold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            className="-mt-1 -mr-1 inline-flex size-12 shrink-0 items-center justify-center rounded-md text-tinta-suave hover:bg-louca focus-visible:outline-3 focus-visible:outline-azulejo"
            aria-label="Fechar janela"
          >
            {ICONS.fechar}
          </DialogPrimitive.Close>
        </div>
        {description === undefined ? null : (
          <DialogPrimitive.Description className="text-tinta-suave">
            {description}
          </DialogPrimitive.Description>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
