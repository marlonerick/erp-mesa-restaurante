'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { KitchenView } from '@/modules/kitchen/web';
import type { FormState } from '@/shared/errors/form-state';
import { HttpError, isGone, withStore } from '../salao/live';

/** Intervalo da leitura automática da cozinha (ADR-0005, RN-KDS-11). */
export const KITCHEN_REFRESH_MS = 3_000;

/** A fila + o instante (relógio do tablet) em que a resposta chegou, para corrigir o relógio. */
export interface LiveBoard extends KitchenView {
  readonly receivedAt: number;
}

export const kitchenKey = ['cozinha'] as const;

async function readBoard(storeId: string): Promise<LiveBoard> {
  const sentAt = Date.now();
  const response = await fetch(withStore('/api/cozinha', storeId), {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (response.status === 401) {
    // Sessão acabou (ou o aparelho foi bloqueado): a página leva ao login
    window.location.reload();
  }
  if (!response.ok) throw new HttpError(response.status);
  const board = (await response.json()) as KitchenView;
  // Meio do caminho entre o pedido e a resposta: melhor estimativa de quando o servidor leu a hora
  return { ...board, receivedAt: (sentAt + Date.now()) / 2 };
}

/** Fila viva: começa com o que o servidor desenhou e se atualiza a cada 3 s (pausa na aba oculta). */
export function useKitchen(initial: KitchenView, storeId: string) {
  const [first] = useState<LiveBoard>(() => ({ ...initial, receivedAt: Date.now() }));
  return useQuery({
    queryKey: kitchenKey,
    queryFn: () => readBoard(storeId),
    initialData: first,
    refetchInterval: (query) => (isGone(query.state.error) ? false : KITCHEN_REFRESH_MS),
    retry: (count, error) => !isGone(error) && count < 1,
  });
}

/** Depois de cada ação (certa ou recusada), lê a fila de novo na hora. */
export function useRefreshAfter(state: FormState | null) {
  const client = useQueryClient();
  useEffect(() => {
    if (state === null) return;
    void client.invalidateQueries({ queryKey: kitchenKey });
  }, [client, state]);
}

/**
 * Hora do SERVIDOR agora, a cada segundo (RN-KDS-09): relógio do tablet + a diferença medida na
 * última leitura. Um tablet com a hora errada não muda o cronômetro.
 */
export function useServerNow(board: LiveBoard): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => {
      window.clearInterval(id);
    };
  }, []);
  return now + (Date.parse(board.serverNow) - board.receivedAt);
}

/**
 * Mantém a tela do tablet acesa enquanto a cozinha está aberta (E7-4), onde o navegador permitir.
 * O navegador solta a trava quando a aba some: ela é pedida de novo quando a aba volta.
 */
export function useWakeLock(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      try {
        const current = await navigator.wakeLock.request('screen');
        if (stopped) {
          void current.release();
          return;
        }
        sentinel = current;
        setActive(true);
        current.addEventListener('release', () => {
          setActive(false);
        });
      } catch {
        // Bateria fraca, aba oculta ou navegador sem permissão: a tela segue as regras do tablet
        setActive(false);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release();
    };
  }, []);
  return active;
}

function beep(audio: AudioContext) {
  // Dois toques curtos e agudos: dá para ouvir com a coifa ligada
  for (const start of [0, 0.25]) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.3;
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(audio.currentTime + start);
    oscillator.stop(audio.currentTime + start + 0.15);
  }
}

/**
 * Aviso sonoro de pedido novo (E7-3). O navegador só toca som depois de um toque na tela: por
 * isso o botão "Ativar som". Pedido que voltou para a fila (desfazer) não toca de novo.
 */
export function useNewTicketSound(ticketIds: readonly string[]) {
  const [enabled, setEnabled] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const key = ticketIds.join(',');

  useEffect(() => {
    const ids = key === '' ? [] : key.split(',');
    if (seen.current === null) {
      // Primeira leitura: o que já estava na fila não é novidade
      seen.current = new Set(ids);
      return;
    }
    const known = seen.current;
    const fresh = ids.filter((id) => !known.has(id));
    for (const id of fresh) known.add(id);
    if (fresh.length > 0 && enabled && audio.current) beep(audio.current);
  }, [key, enabled]);

  return {
    enabled,
    toggle: () => {
      if (enabled) {
        setEnabled(false);
        return;
      }
      audio.current ??= new AudioContext();
      void audio.current.resume();
      // Toca uma vez para a pessoa saber o som (e o volume)
      beep(audio.current);
      setEnabled(true);
    },
  };
}
