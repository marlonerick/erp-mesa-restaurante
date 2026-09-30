import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { toKitchenView } from '@/modules/kitchen/web';
import { mysqlErrno } from '@/shared/db/mysql-errors';
import { kitchenTicket, store } from '@/shared/db/schema';
import { useTestDatabase } from '../../../support/database';
import { TEST_START } from '../../../support/identity';
import { kitchenWorld } from './kitchen-world';

// Regras de borda da cozinha: concorrência (RN-KDS-12), isolamento (RN-KDS-01), situação e horas
// do ticket (RN-KDS-06), janelas de tempo (RN-KDS-08, RN-KDS-10) e garantias do banco.

const { db } = useTestDatabase();
/** ER_CHECK_CONSTRAINT_VIOLATED */
const CHECK_VIOLATION = 3819;
const w = kitchenWorld(db);

async function settle<T>(work: Promise<T>) {
  try {
    return { ok: true as const, value: await work };
  } catch (error) {
    return { ok: false as const, code: (error as { code?: string }).code, error };
  }
}

async function ticketRow(title: string) {
  const { queue, recent, cancelled } = await w.refresh();
  const ticket = w.ticketIn([...queue, ...recent, ...cancelled], title);
  const [row] = await db.select().from(kitchenTicket).where(eq(kitchenTicket.id, ticket.id));
  if (!row) throw new Error('ticket sumiu');
  return row;
}

beforeEach(async () => {
  w.services.clock.set(TEST_START);
  await w.first('carla', 'GERENTE', '246810');
  await w.person('joão', 'GARCOM');
  await w.person('rita', 'COZINHA');
  await w.person('beto', 'COZINHA');
  await w.sells('X-Burger', '32,00');
  await w.sells('Batata frita', '18,00');
  await w.sells('Refrigerante lata', '7,00', { noPrep: true });
  await w.recipe('PRODUCT', 'X-Burger', '150', 'Carne moída');
  await w.stockOf('Carne moída', '1');
  for (const number of ['1', '2', '3']) await w.createTable(number);
});

describe('dois tablets ao mesmo tempo (RN-KDS-12)', () => {
  it('pronto no mesmo item: os dois terminam sem erro e só um muda', async () => {
    await w.sendTo('joão', '1', [{ quantity: 1, product: 'X-Burger' }]);
    const itemId = (await w.sentItem('1', 0)).id;
    const results = await Promise.all(
      ['rita', 'beto'].map((by) => settle(w.services.kitchen.readyItem(w.ctx(by), { itemId }))),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    const changed = results.filter((result) => result.ok && result.value.changed);
    expect(changed).toHaveLength(1);
    expect((await w.sentItem('1', 0)).status).toBe('PRONTO');
    expect([w.userId('rita'), w.userId('beto')]).toContain(await w.readyBy('1', 0));
  });

  it('"tudo pronto" nos dois tablets: um marca os itens, o outro não muda nada', async () => {
    await w.sendTo('joão', '1', [
      { quantity: 1, product: 'X-Burger' },
      { quantity: 2, product: 'Batata frita' },
    ]);
    const ticketId = w.ticketIn((await w.refresh()).queue, 'Mesa 1').id;
    const results = await Promise.all(
      ['rita', 'beto'].map((by) => settle(w.services.kitchen.readyTicket(w.ctx(by), { ticketId }))),
    );
    expect(results.map((result) => (result.ok ? result.value.changed : -1)).sort()).toEqual([0, 2]);
    expect((await ticketRow('Mesa 1')).status).toBe('PRONTO');
  });

  it('cozinha marca pronto enquanto o gerente cancela: o ticket fica coerente com os itens', async () => {
    await w.sendTo('joão', '1', [{ quantity: 1, product: 'X-Burger' }]);
    const itemId = (await w.sentItem('1', 0)).id;
    const [ready, cancel] = await Promise.all([
      settle(w.services.kitchen.readyItem(w.ctx('rita'), { itemId })),
      settle(w.services.orders.cancelItem(w.ctx('carla'), { itemId, reason: 'cliente desistiu' })),
    ]);
    // O cancelamento sempre passa; o pronto passa (antes) ou é recusado (depois)
    expect(cancel.ok).toBe(true);
    expect(ready.ok || ready.code === 'ITEM_CANCELLED').toBe(true);
    expect((await w.sentItem('1', 0)).status).toBe('CANCELADO');
    expect((await ticketRow('Mesa 1')).status).toBe('CANCELADO');
    // Pronto antes: vira perda (150 g saíram); cancelado antes: volta ao estoque
    await w.expectBalance('Carne moída', ready.ok ? '850.000' : '1000.000');
  });
});

describe('o que não passa pela cozinha', () => {
  it('bebida sem preparo e item não enviado são recusados', async () => {
    await w.sendTo('joão', '1', [{ quantity: 1, product: 'Refrigerante lata' }]);
    await w.attempt(() => w.ready('rita', '1', 0));
    w.expectFailure('ITEM_NOT_IN_KITCHEN');

    await w.add('joão', { table: '1' }, 1, 'X-Burger');
    const [pending] = await w.pendingIds('1');
    await w.attempt(() =>
      w.services.kitchen.startItem(w.ctx('rita'), { itemId: pending ?? ('' as never) }),
    );
    w.expectFailure('ITEM_NOT_IN_KITCHEN');
  });
});

describe('isolamento entre lojas (RN-KDS-01)', () => {
  it('a cozinha da Praia não vê nem marca o ticket do Centro', async () => {
    await w.personAt('paula', 'COZINHA', 'Praia');
    await w.sendTo('joão', '1', [{ quantity: 1, product: 'X-Burger' }]);
    const ticketId = w.ticketIn((await w.refresh()).queue, 'Mesa 1').id;
    const itemId = (await w.sentItem('1', 0)).id;

    expect((await w.services.kitchen.board(w.ctx('paula'))).queue).toEqual([]);
    await w.attempt(() => w.services.kitchen.readyTicket(w.ctx('paula'), { ticketId }));
    w.expectFailure('KITCHEN_TICKET_NOT_FOUND');
    for (const action of ['startItem', 'readyItem', 'undoReady'] as const) {
      await w.attempt(() => w.services.kitchen[action](w.ctx('paula'), { itemId }));
      w.expectFailure('ORDER_ITEM_NOT_FOUND');
    }
    expect((await w.sentItem('1', 0)).status).toBe('ENVIADO');
  });
});

describe('situação e horas do ticket (RN-KDS-06)', () => {
  it('guarda quando começou, quando ficou pronto e quando saiu da fila; desfazer limpa', async () => {
    await w.sendTo('joão', '1', [
      { quantity: 1, product: 'X-Burger' },
      { quantity: 1, product: 'Batata frita' },
    ]);
    expect(await ticketRow('Mesa 1')).toMatchObject({
      status: 'NOVO',
      startedAt: null,
      readyAt: null,
      finishedAt: null,
    });

    w.services.clock.advanceMinutes(2);
    await w.start('rita', '1', 0);
    const started = w.services.clock.now();
    expect(await ticketRow('Mesa 1')).toMatchObject({ status: 'EM_PREPARO', startedAt: started });

    w.services.clock.advanceMinutes(5);
    await w.readyAll('rita', 'Mesa 1');
    const ready = w.services.clock.now();
    expect(await ticketRow('Mesa 1')).toMatchObject({
      status: 'PRONTO',
      startedAt: started,
      readyAt: ready,
      finishedAt: ready,
    });

    await w.undo('rita', '1', 1);
    expect(await ticketRow('Mesa 1')).toMatchObject({
      status: 'EM_PREPARO',
      startedAt: started,
      readyAt: null,
      finishedAt: null,
    });
    // O item desfeito "começou" quando foi desfeito (ninguém tinha tocado em Iniciar)
    expect((await w.refresh()).queue[0]?.items[1]).toMatchObject({
      status: 'EM_PREPARO',
      startedAt: w.services.clock.now(),
      readyAt: null,
      readyBy: null,
    });
  });

  it('desfazer devolve o ticket à posição original da fila', async () => {
    await w.sendTo('joão', '1', [{ quantity: 1, product: 'X-Burger' }]);
    w.services.clock.advanceMinutes(1);
    await w.sendTo('joão', '2', [{ quantity: 1, product: 'X-Burger' }]);
    await w.ready('rita', '1', 0);
    await w.refresh();
    w.expectQueue(['Mesa 2']);
    await w.undo('rita', '1', 0);
    await w.refresh();
    w.expectQueue(['Mesa 1', 'Mesa 2']);
  });

  it('as ações da cozinha não mudam a versão da conta (o garçom não recebe conflito)', async () => {
    await w.sendTo('joão', '1', [{ quantity: 1, product: 'X-Burger' }]);
    const before = await w.version('1');
    await w.start('rita', '1', 0);
    await w.ready('rita', '1', 0);
    await w.undo('rita', '1', 0);
    expect(await w.version('1')).toBe(before);
  });

  it('mesas juntadas: o ticket vai junto e a cozinha continua marcando', async () => {
    await w.sendTo('joão', '1', [{ quantity: 1, product: 'X-Burger' }]);
    await w.sendTo('joão', '2', [{ quantity: 1, product: 'Batata frita' }]);
    await w.join('joão', '2', '1');
    const { queue } = await w.refresh();
    expect(w.titles(queue)).toEqual(['Mesa 1 + 2', 'Mesa 1 + 2']);
    await w.readyAll('rita', 'Mesa 1 + 2');
    await w.readyAll('rita', 'Mesa 1 + 2');
    expect((await w.refresh()).queue).toEqual([]);
    expect((await w.sentItems('1')).map((item) => item.status)).toEqual(['PRONTO', 'PRONTO']);
  });
});

describe('janelas de tempo (RN-KDS-08, RN-KDS-10)', () => {
  it('prontos há pouco: some depois de 15 minutos', async () => {
    await w.sendTo('joão', '1', [{ quantity: 1, product: 'X-Burger' }]);
    await w.ready('rita', '1', 0);
    expect(w.titles((await w.refresh()).recent)).toEqual(['Mesa 1']);
    w.services.clock.advanceMinutes(15);
    expect(w.titles((await w.refresh()).recent)).toEqual(['Mesa 1']);
    w.services.clock.advanceSeconds(1);
    expect((await w.refresh()).recent).toEqual([]);
  });

  it('cancelado fica riscado por 30 segundos e depois some', async () => {
    await w.sendTo('joão', '1', [
      { quantity: 1, product: 'X-Burger' },
      { quantity: 1, product: 'Batata frita' },
    ]);
    await w.sendTo('joão', '2', [{ quantity: 1, product: 'X-Burger' }]);
    await w.cancel('carla', '1', 0, 'cliente desistiu');
    await w.cancel('carla', '2', 0, 'mesa foi embora');

    let view = toKitchenView(await w.refresh());
    expect(view.queue[0]?.items.map((item) => item.status)).toEqual(['CANCELADO', 'ENVIADO']);
    expect(view.cancelled.map((ticket) => ticket.title)).toEqual(['Mesa 2']);

    w.services.clock.advanceSeconds(31);
    view = toKitchenView(await w.refresh());
    expect(view.queue[0]?.items.map((item) => item.productName)).toEqual(['Batata frita']);
    expect(view.cancelled).toEqual([]);
  });

  it('a tela não mostra preços e já traz os textos', async () => {
    await w.sendTo('joão', '1', [{ quantity: 2, product: 'X-Burger', notes: 'sem cebola' }]);
    const view = toKitchenView(await w.refresh());
    expect(view.queue[0]).toMatchObject({
      title: 'Mesa 1',
      status: 'NOVO',
      items: [
        {
          quantity: 2,
          productName: 'X-Burger',
          notes: 'sem cebola',
          status: 'ENVIADO',
          statusLabel: 'Na cozinha',
        },
      ],
    });
    expect(JSON.stringify(view)).not.toMatch(/cents/i);
  });
});

describe('garantias do banco', () => {
  it('tempos de alerta fora da regra são recusados pelo CHECK', async () => {
    for (const [warning, late] of [
      [0, 20],
      [20, 10],
      [10, 241],
    ] as const) {
      const result = await settle(
        db
          .update(store)
          .set({ kdsWarningMinutes: warning, kdsLateMinutes: late })
          .where(eq(store.id, w.org.centro)),
      );
      expect(result.ok ? null : mysqlErrno(result.error)).toBe(CHECK_VIOLATION);
    }
  });

  it('loja nova nasce com 10 e 20 minutos', async () => {
    const [row] = await db
      .select({ warning: store.kdsWarningMinutes, late: store.kdsLateMinutes })
      .from(store)
      .where(eq(store.id, w.org.praia));
    expect(row).toEqual({ warning: 10, late: 20 });
  });
});
