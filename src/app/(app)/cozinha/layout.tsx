import type { ReactNode } from 'react';
import { QueryProvider } from '@/ui/query-provider';

/** A tela da cozinha lê o servidor a cada 3 s (ADR-0005) pelo TanStack Query (E6-6). */
export default function KitchenLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
