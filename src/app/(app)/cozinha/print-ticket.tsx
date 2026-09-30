'use client';

import type { KitchenTicketView } from '@/modules/kitchen/web';

const time = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);

/**
 * Via da cozinha em 80 mm (Q-02 = A, ADR-0010): só aparece na impressão (globals.css,
 * `.area-impressao`). Sem preços; observação em maiúsculas para chamar a atenção no papel.
 */
export function PrintTicket({
  ticket,
  stationName,
}: {
  readonly ticket: KitchenTicketView;
  readonly stationName: string;
}) {
  return (
    <div className="area-impressao" data-testid="via-da-cozinha">
      <p className="via-centro">{stationName.toUpperCase()}</p>
      <p className="via-titulo">{ticket.title}</p>
      <p>
        Conta {ticket.orderNumber} · Rodada {ticket.roundNumber}
      </p>
      <p>
        Enviado {time(new Date(ticket.createdAt))}
        {ticket.sentByName ? ` · ${ticket.sentByName}` : ''}
      </p>
      <hr />
      {ticket.items
        .filter((item) => item.status !== 'CANCELADO')
        .map((item) => (
          <div key={item.id} className="via-item">
            <p className="via-produto">
              {item.quantity} × {item.productName}
            </p>
            {item.modifiers.map((name) => (
              <p key={name}>+ {name}</p>
            ))}
            {item.notes ? <p className="via-obs">OBS: {item.notes.toUpperCase()}</p> : null}
          </div>
        ))}
      <hr />
      <p>Impresso às {time(new Date())}</p>
    </div>
  );
}
