'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { FloorView, OrderView } from '@/modules/orders/web';
import type { FormState } from '@/shared/errors/form-state';

/** Intervalo da leitura automática do salão e da comanda (ADR-0005). */
export const REFRESH_MS = 5_000;

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
  if (response.status === 401) {
    // Sessão acabou (ou o aparelho foi bloqueado): a página leva ao login
    window.location.reload();
  }
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return (await response.json()) as T;
}

export const floorKey = ['salao'] as const;
export const orderKey = (id: string) => ['comanda', id] as const;

/** Mapa do salão vivo: começa com o que o servidor desenhou e se atualiza sozinho. */
export function useFloor(initial: FloorView, enabled = true) {
  return useQuery({
    queryKey: floorKey,
    queryFn: () => readJson<FloorView>('/api/salao'),
    initialData: initial,
    refetchInterval: enabled ? REFRESH_MS : false,
    enabled,
  });
}

export function useOrder(initial: OrderView) {
  return useQuery({
    queryKey: orderKey(initial.id),
    queryFn: () => readJson<OrderView>(`/api/comandas/${initial.id}`),
    initialData: initial,
    refetchInterval: REFRESH_MS,
  });
}

/** Depois de cada ação (certa ou recusada), lê o salão e a comanda de novo na hora. */
export function useRefreshAfter(state: FormState | null) {
  const client = useQueryClient();
  useEffect(() => {
    if (state === null) return;
    void client.invalidateQueries();
  }, [client, state]);
}
