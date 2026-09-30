'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

/**
 * TanStack Query (ADR-0012, E6-6): dados do servidor que mudam com a tela aberta — mapa do salão e
 * comanda, lidos a cada 5 s (ADR-0005). Um cliente por aba.
 */
export function QueryProvider({ children }: { readonly children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: true, retry: 1, staleTime: 2_000 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
