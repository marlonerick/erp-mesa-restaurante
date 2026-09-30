import { ITEM_STATUS_LABEL, type OrderItemStatus } from '@/modules/orders';
import type { BoardTicket, KitchenBoard } from '../application/kitchen';
import { CANCELLED_VISIBLE_SECONDS } from '../domain/rules';

// Dados prontos para a tela da cozinha e para a leitura automática (JSON): datas em texto ISO,
// textos já traduzidos, SEM preços. A tela nunca importa o domínio (ADR-0014).

export type KitchenTicketStatus = 'NOVO' | 'EM_PREPARO' | 'PRONTO' | 'CANCELADO';

export interface KitchenItemView {
  readonly id: string;
  readonly productName: string;
  readonly quantity: number;
  readonly modifiers: string[];
  readonly notes: string | null;
  readonly status: OrderItemStatus;
  readonly statusLabel: string;
  readonly cancelReason: string | null;
}

export interface KitchenTicketView {
  readonly id: string;
  readonly status: KitchenTicketStatus;
  /** "Mesa 10" ou "Balcão · Ana". */
  readonly title: string;
  readonly orderNumber: number;
  readonly roundNumber: number;
  readonly sentByName: string | null;
  /** Envio da rodada: o cronômetro conta daqui (RN-KDS-09). */
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly items: KitchenItemView[];
}

export interface KitchenView {
  readonly serverNow: string;
  readonly stationName: string;
  readonly warningMinutes: number;
  readonly lateMinutes: number;
  readonly queue: KitchenTicketView[];
  readonly cancelled: KitchenTicketView[];
  readonly recent: KitchenTicketView[];
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

function toTicketView(
  ticket: BoardTicket,
  keepItem: (item: BoardTicket['items'][number]) => boolean,
): KitchenTicketView {
  return {
    id: ticket.id,
    status: ticket.status,
    title:
      ticket.orderType === 'MESA' ? `Mesa ${ticket.orderLabel}` : `Balcão · ${ticket.orderLabel}`,
    orderNumber: ticket.orderNumber,
    roundNumber: ticket.roundNumber,
    sentByName: ticket.sentByName,
    createdAt: ticket.createdAt.toISOString(),
    finishedAt: iso(ticket.finishedAt),
    items: ticket.items.filter(keepItem).map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      modifiers: item.modifiers.map((extra) => extra.name),
      notes: item.notes,
      status: item.status,
      statusLabel: ITEM_STATUS_LABEL[item.status],
      cancelReason: item.cancelReason,
    })),
  };
}

export function toKitchenView(board: KitchenBoard): KitchenView {
  const cutoff = board.serverNow.getTime() - CANCELLED_VISIBLE_SECONDS * 1000;
  // Item cancelado fica riscado por 30 s e depois some do ticket (RN-KDS-08)
  const recentlyCancelled = (item: BoardTicket['items'][number]) =>
    item.status !== 'CANCELADO' || (item.cancelledAt?.getTime() ?? 0) >= cutoff;
  return {
    serverNow: board.serverNow.toISOString(),
    stationName: board.station.name,
    warningMinutes: board.warningMinutes,
    lateMinutes: board.lateMinutes,
    queue: board.queue.map((ticket) => toTicketView(ticket, recentlyCancelled)),
    cancelled: board.cancelled.map((ticket) => toTicketView(ticket, () => true)),
    recent: board.recent.map((ticket) =>
      toTicketView(ticket, (item) => item.status !== 'CANCELADO'),
    ),
  };
}
