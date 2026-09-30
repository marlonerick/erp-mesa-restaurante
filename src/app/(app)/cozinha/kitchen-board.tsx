'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { type AlertLevel, alertLevel, formatElapsed } from '@/modules/kitchen/interface/timing';
import type { KitchenTicketView, KitchenView } from '@/modules/kitchen/web';
import { Button } from '@/ui/button';
import { isGone } from '../salao/live';
import { useKitchen, useNewTicketSound, useServerNow, useWakeLock } from './live';
import { PrintTicket } from './print-ticket';
import { RecentTicket, TicketCard } from './ticket-card';

interface Props {
  readonly initial: KitchenView;
  readonly storeId: string;
  readonly storeName: string;
  /** Tem `kds.manage`; senão (garçom), só acompanha. */
  readonly canManage: boolean;
  /** Entrou como "aparelho compartilhado": a tela trava após 3 min sem toque (E2-3). */
  readonly sharedDevice: boolean;
}

/**
 * Tela da cozinha (RN-KDS-02 a RN-KDS-14): fila do mais antigo para o mais novo, cronômetro com a
 * hora do servidor, cor + texto do alerta, botões grandes, "prontos há pouco" e impressão de 80 mm.
 */
export function KitchenBoard({ initial, storeId, storeName, canManage, sharedDevice }: Props) {
  const { data: board, isError, error } = useKitchen(initial);
  const serverNow = useServerNow(board);
  const awake = useWakeLock();
  const sound = useNewTicketSound(board.queue.map((ticket) => ticket.id));
  const [printing, setPrinting] = useState<KitchenTicketView | null>(null);
  const thresholds = { warningMinutes: board.warningMinutes, lateMinutes: board.lateMinutes };
  const levelOf = (ticket: KitchenTicketView): AlertLevel =>
    alertLevel(serverNow - Date.parse(ticket.createdAt), thresholds);
  const late = board.queue.filter((ticket) => levelOf(ticket) === 'ATRASADO').length;

  // Imprime depois que a via da cozinha foi desenhada fora da tela (ADR-0010)
  useEffect(() => {
    if (!printing) return;
    const done = () => {
      setPrinting(null);
    };
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    return () => {
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Cozinha</h1>
          <p className="text-tinta-suave">
            Loja {storeName} · {board.stationName} · amarelo aos {board.warningMinutes} min,
            vermelho aos {board.lateMinutes} min
          </p>
          <p className="text-xl font-bold" aria-live="polite">
            {board.queue.length === 1
              ? '1 pedido na fila'
              : `${String(board.queue.length)} pedidos na fila`}
            {late > 0 ? ` · ${String(late)} atrasado${late === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {awake ? <span className="text-sm text-tinta-suave">Tela sempre acesa</span> : null}
          <Button
            variant={sound.enabled ? 'primary' : 'secondary'}
            onClick={sound.toggle}
            aria-pressed={sound.enabled}
          >
            {sound.enabled ? 'Som ligado' : 'Ativar som'}
          </Button>
        </div>
      </header>

      {sharedDevice ? (
        <p
          role="note"
          className="rounded-md border-l-4 border-atencao bg-atencao-claro px-4 py-3 font-semibold text-atencao"
        >
          Este tablet entrou como “aparelho compartilhado”: a tela volta para a troca de usuário
          depois de 3 minutos sem toque. Para a cozinha, saia e entre de novo sem marcar essa opção.
        </p>
      ) : null}

      {isError ? (
        <p
          role="status"
          className="rounded-md bg-atencao-claro px-4 py-2 font-semibold text-atencao"
        >
          {isGone(error)
            ? 'Sem acesso à cozinha desta loja (a loja foi trocada em outra aba?). Recarregue a página.'
            : 'Sem conexão com o servidor. Tentando de novo…'}
        </p>
      ) : null}

      <section aria-labelledby="fila" className="flex flex-col gap-4">
        <h2 id="fila" className="sr-only">
          Fila
        </h2>
        {board.queue.length === 0 && board.cancelled.length === 0 ? (
          <p className="rounded-md border-2 border-dashed border-borda bg-white px-4 py-10 text-center text-lg text-tinta-suave">
            Nenhum pedido na fila. Os pedidos que o salão enviar aparecem aqui sozinhos.
          </p>
        ) : (
          <ul
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] items-start gap-4"
            aria-label="Pedidos na fila"
          >
            {board.cancelled.map((ticket) => (
              <li key={ticket.id}>
                <TicketCard
                  ticket={ticket}
                  level="NORMAL"
                  elapsedText={null}
                  storeId={storeId}
                  canManage={false}
                  onPrint={null}
                />
              </li>
            ))}
            {board.queue.map((ticket) => (
              <li key={ticket.id}>
                <TicketCard
                  ticket={ticket}
                  level={levelOf(ticket)}
                  elapsedText={formatElapsed(serverNow - Date.parse(ticket.createdAt))}
                  storeId={storeId}
                  canManage={canManage}
                  onPrint={
                    canManage
                      ? () => {
                          setPrinting(ticket);
                        }
                      : null
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="prontos" className="flex flex-col gap-3">
        <h2 id="prontos" className="text-2xl font-bold">
          Prontos há pouco
        </h2>
        <p className="text-sm text-tinta-suave">
          Últimos 15 minutos. Marcou pronto por engano? Toque em “Desfazer” enquanto o garçom não
          entregou.
        </p>
        {board.recent.length === 0 ? (
          <p className="text-tinta-suave">Nenhum pedido pronto nos últimos 15 minutos.</p>
        ) : (
          <ul className="flex flex-col border-t border-borda" aria-label="Prontos há pouco">
            {board.recent.map((ticket) => (
              <li key={ticket.id} className="border-b border-borda py-3">
                <RecentTicket ticket={ticket} storeId={storeId} canManage={canManage} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {printing
        ? createPortal(
            <PrintTicket ticket={printing} stationName={board.stationName} />,
            document.body,
          )
        : null}
    </div>
  );
}
