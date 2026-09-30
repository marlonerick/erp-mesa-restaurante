'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { FloorView, OrderView } from '@/modules/orders/web';
import type { FormState } from '@/shared/errors/form-state';

/** Intervalo da leitura automática do salão e da comanda (ADR-0005). */
export const REFRESH_MS = 5_000;

/** Resposta de erro do servidor, com o status HTTP. */
export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${String(status)}`);
  }
}

/**
 * Sem acesso (403), não existe mais nesta loja (404) ou a loja foi trocada em outra aba (409):
 * tentar de novo não resolve — a leitura automática para e a tela explica (sugestão S-2 da revisão
 * da Etapa 6, achado I-4 da Etapa 7).
 */
export const isGone = (error: unknown) =>
  error instanceof HttpError && [403, 404, 409].includes(error.status);

/** Leitura automática com a loja que a TELA mostra (`?loja=`): o servidor recusa se mudou. */
export const withStore = (url: string, storeId: string) =>
  `${url}?loja=${encodeURIComponent(storeId)}`;

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
  if (response.status === 401) {
    // Sessão acabou (ou o aparelho foi bloqueado): a página leva ao login
    window.location.reload();
  }
  if (!response.ok) throw new HttpError(response.status);
  return (await response.json()) as T;
}

export const floorKey = ['salao'] as const;
export const orderKey = (id: string) => ['comanda', id] as const;

/** Mapa do salão vivo: começa com o que o servidor desenhou e se atualiza sozinho. */
export function useFloor(initial: FloorView, storeId: string, enabled = true) {
  return useQuery({
    queryKey: floorKey,
    queryFn: () => readJson<FloorView>(withStore('/api/salao', storeId)),
    initialData: initial,
    refetchInterval: (query) => (enabled && !isGone(query.state.error) ? REFRESH_MS : false),
    retry: (count, error) => !isGone(error) && count < 1,
    enabled,
  });
}

export function useOrder(initial: OrderView) {
  return useQuery({
    queryKey: orderKey(initial.id),
    queryFn: () => readJson<OrderView>(`/api/comandas/${initial.id}`),
    initialData: initial,
    refetchInterval: (query) => (isGone(query.state.error) ? false : REFRESH_MS),
    retry: (count, error) => !isGone(error) && count < 1,
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
