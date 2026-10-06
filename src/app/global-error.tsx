'use client';

import './globals.css';

/** Último recurso, em português, quando nem o layout carrega (substitui a página do Next). */
export default function GlobalError({
  reset,
}: {
  readonly error: Error;
  readonly reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-white p-8 font-sans text-tinta antialiased">
        <main role="alert" className="mx-auto flex max-w-xl flex-col gap-4">
          <h1 className="text-3xl font-bold">O sistema não respondeu</h1>
          <p className="text-lg">
            Confira a internet e tente de novo. O que já foi salvo continua salvo.
          </p>
          <button
            type="button"
            onClick={() => {
              reset();
            }}
            className="min-h-12 self-start rounded-md bg-azulejo px-5 font-semibold text-white"
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
