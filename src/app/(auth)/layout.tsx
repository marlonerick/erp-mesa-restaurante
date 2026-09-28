import type { ReactNode } from 'react';

/** Telas de entrada: faixa de azulejo (lateral no tablet/computador, no topo no celular). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    // No celular/tablet a faixa ocupa só a própria altura (auto) e o conteúdo fica logo abaixo
    <div className="grid min-h-dvh grid-rows-[auto_1fr] lg:grid-cols-[minmax(280px,36%)_1fr] lg:grid-rows-1">
      <div className="azulejo-pattern h-24 sm:h-32 lg:h-auto" aria-hidden="true" />
      <main className="flex items-start justify-center px-4 py-8 sm:px-10 lg:items-center">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
