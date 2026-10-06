'use client';

import Link from 'next/link';
import { Button } from '@/ui/button';

/**
 * Tela de erro da área logada, em português (Etapa 10). Aparece quando a página não carrega
 * (internet caiu ao trocar de tela, erro inesperado no servidor). Os formulários tratam a queda
 * de conexão no próprio lugar (`useServerAction`); aqui é o último recurso.
 */
export default function AppError({ reset }: { readonly error: Error; readonly reset: () => void }) {
  return (
    <div role="alert" className="flex max-w-xl flex-col gap-4">
      <h1 className="text-3xl font-bold">Não foi possível abrir esta tela</h1>
      <p className="text-lg">
        Pode ser a internet ou um problema no servidor. Confira a conexão e tente de novo. O que já
        foi salvo continua salvo.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => {
            reset();
          }}
        >
          Tentar de novo
        </Button>
        <Link
          href="/inicio"
          className="flex min-h-12 items-center px-2 font-semibold text-azulejo underline"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
