import type { Transaction } from '@/shared/db/transaction';
import type { Id } from '@/shared/kernel';
import { orderErrors } from './orders';
import type { KitchenItemRecord, KitchenTicketRecord, OrdersRepository } from './ports';

// O que a cozinha (módulo Kitchen) usa do Orders, SEMPRE dentro da transação de quem chama. O
// ticket e o item são tabelas do Orders (maps/modules/dependencias.md); Orders não conhece Kitchen.

const LOCK = { forUpdate: true } as const;
/** A conta pode ser juntada em outra enquanto a transação espera a trava: tenta de novo. */
const ATTEMPTS = 3;

export function kitchenPort(repo: OrdersRepository) {
  async function lockOrderOf(tx: Transaction, storeId: Id, orderId: Id) {
    const order = await repo.findOrder(tx, { storeId, orderId }, LOCK);
    if (!order) throw orderErrors.orderNotFound();
  }

  type Args<K extends keyof OrdersRepository> = Parameters<OrdersRepository[K]>;
  return {
    listQueue: (...args: Args<'listQueue'>) => repo.listQueue(...args),
    listFinished: (...args: Args<'listFinished'>) => repo.listFinished(...args),
    listTicketItems: (...args: Args<'listTicketItems'>) => repo.listTicketItems(...args),
    startItems: (...args: Args<'startItems'>) => repo.startItems(...args),
    readyItems: (...args: Args<'readyItems'>) => repo.readyItems(...args),
    undoReady: (...args: Args<'undoReady'>) => repo.undoReady(...args),
    refreshTicket: (...args: Args<'refreshTicket'>) => repo.refreshTicket(...args),

    /**
     * Item da loja com a CONTA travada antes (mesma ordem do salão — RN-ORD-22) e relido com trava:
     * quem esperou vê o que o outro tablet ou o garçom acabou de gravar (RN-KDS-12).
     */
    async lockItem(tx: Transaction, storeId: Id, itemId: Id): Promise<KitchenItemRecord> {
      let seen = await repo.findKitchenItem(tx, { storeId, itemId });
      if (!seen) throw orderErrors.itemNotFound();
      for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        await lockOrderOf(tx, storeId, seen.orderId);
        const item = await repo.findKitchenItem(tx, { storeId, itemId }, LOCK);
        if (!item) throw orderErrors.itemNotFound();
        if (item.orderId === seen.orderId) return item;
        seen = item;
      }
      throw orderErrors.concurrent();
    },

    /** Ticket da loja + itens dele, com a conta travada antes (RN-KDS-12). */
    async lockTicket(
      tx: Transaction,
      storeId: Id,
      ticketId: Id,
    ): Promise<{ ticket: KitchenTicketRecord; items: KitchenItemRecord[] } | null> {
      let seen = await repo.findTicket(tx, { storeId, ticketId });
      if (!seen) return null;
      for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        await lockOrderOf(tx, storeId, seen.orderId);
        const ticket = await repo.findTicket(tx, { storeId, ticketId }, LOCK);
        if (!ticket) return null;
        if (ticket.orderId === seen.orderId) {
          return { ticket, items: await repo.listTicketItems(tx, [ticket.id], LOCK) };
        }
        seen = ticket;
      }
      throw orderErrors.concurrent();
    },
  };
}

export type KitchenPort = ReturnType<typeof kitchenPort>;
