import type { ReactNode } from 'react';
import { QueryProvider } from '@/ui/query-provider';

/** O painel do dia lê o servidor a cada 30 s (RN-REP-03) pelo TanStack Query. */
export default function HomeLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
