import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import type { BoardTicket, KitchenBoard } from '@/modules/kitchen';
import type { Database } from '@/shared/db/client';
import { orderItem, store } from '@/shared/db/schema';
import { newId } from '@/shared/kernel';
import { floorWorld } from '../orders/floor-world';

interface Line {
  readonly quantity: number;
  readonly product: string;
  readonly modifier?: string;
  readonly notes?: string;
}

/**
 * Cenários da cozinha: o salão (floorWorld) + a tela da cozinha. Os itens são apontados pela
 * posição na conta da mesa ("primeiro item da mesa 10"), como nos cenários do salão.
 */
export function kitchenWorld(db: Database) {
  const floor = floorWorld(db);
  let board: KitchenBoard | null = null;
  let lastChanged: boolean | number | null = null;

  const itemId = async (table: string, position: number) =>
    (await floor.sentItem(table, position)).id;
  const kitchen = () => floor.services.kitchen;

  function shown(): KitchenBoard {
    if (!board) throw new Error('a tela da cozinha não foi aberta no cenário');
    return board;
  }

  const title = (ticket: BoardTicket) =>
    ticket.orderType === 'MESA' ? `Mesa ${ticket.orderLabel}` : `Balcão · ${ticket.orderLabel}`;

  function ticketIn(tickets: readonly BoardTicket[], name: string): BoardTicket {
    const found = tickets.find((ticket) => title(ticket) === name);
    if (!found) throw new Error(`o pedido "${name}" não está na tela`);
    return found;
  }

  const k = {
    get board() {
      return shown();
    },
    get lastChanged() {
      return lastChanged;
    },
    title,
    ticketIn,
    titles: (tickets: readonly BoardTicket[]) => tickets.map(title),

    /** Abre a mesa (se livre), lança e envia uma rodada. */
    async sendTo(by: string, table: string, lines: readonly Line[]) {
      if ((await floor.floorStatus(table)) === 'LIVRE') await floor.open(by, table);
      for (const line of lines) {
        await floor.add(by, { table }, line.quantity, line.product, {
          ...(line.modifier ? { modifier: line.modifier } : {}),
          ...(line.notes ? { notes: line.notes } : {}),
        });
      }
      await floor.send(by, table);
    },

    async sendToCounter(by: string, label: string, quantity: number, product: string) {
      await floor.openCounter(by, label);
      await floor.add(by, { counter: label }, quantity, product);
      const orderId = floor.counter(label);
      const detail = await floor.services.orders.getOrder(floor.ctx(by), orderId);
      await floor.services.orders.sendRound(floor.ctx(by), {
        orderId,
        itemIds: detail.pending.map((item) => item.id),
        idempotencyKey: newId(),
      });
    },

    async openBoard(by: string) {
      board = await kitchen().board(floor.ctx(by));
    },

    /** Lê a tela de novo como o sistema (ADMIN). */
    async refresh() {
      board = await kitchen().board(floor.ctx('sistema'));
      return board;
    },

    async start(by: string, table: string, position: number) {
      const { changed } = await kitchen().startItem(floor.ctx(by), {
        itemId: await itemId(table, position),
      });
      lastChanged = changed;
    },

    async ready(by: string, table: string, position: number) {
      const { changed } = await kitchen().readyItem(floor.ctx(by), {
        itemId: await itemId(table, position),
      });
      lastChanged = changed;
    },

    async readyAll(by: string, name: string) {
      const ticket = ticketIn((await k.refresh()).queue, name);
      const { changed } = await kitchen().readyTicket(floor.ctx(by), { ticketId: ticket.id });
      lastChanged = changed;
    },

    async undo(by: string, table: string, position: number) {
      const { changed } = await kitchen().undoReady(floor.ctx(by), {
        itemId: await itemId(table, position),
      });
      lastChanged = changed;
    },

    async deliver(by: string, table: string, position: number) {
      await floor.services.orders.deliverItem(floor.ctx(by), {
        itemId: await itemId(table, position),
      });
    },

    async setAlerts(warningMinutes: number, lateMinutes: number) {
      await db
        .update(store)
        .set({ kdsWarningMinutes: warningMinutes, kdsLateMinutes: lateMinutes })
        .where(eq(store.id, floor.org.centro));
    },

    async readyBy(table: string, position: number) {
      const [row] = await db
        .select({ by: orderItem.readyBy })
        .from(orderItem)
        .where(eq(orderItem.id, await itemId(table, position)));
      return row?.by ?? null;
    },

    expectQueue(names: readonly string[]) {
      expect(shown().queue.map(title)).toEqual(names);
    },
  };

  // Herda do salão sem copiar: os "getters" dele (falha da última ação, organização) continuam vivos
  return Object.create(floor, Object.getOwnPropertyDescriptors(k)) as typeof floor & typeof k;
}

export type KitchenWorld = ReturnType<typeof kitchenWorld>;
