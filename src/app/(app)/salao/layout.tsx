import type { ReactNode } from 'react';
import { QueryProvider } from '@/ui/query-provider';

/** Salão e comanda leem o servidor a cada 5 s (ADR-0005) pelo TanStack Query (E6-6). */
export default function FloorLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
