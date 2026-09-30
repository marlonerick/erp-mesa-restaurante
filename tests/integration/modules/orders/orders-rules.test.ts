import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { mysqlErrno } from '@/shared/db/mysql-errors';
import { customerOrder, diningTable, orderItem } from '@/shared/db/schema';
import { newId } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import { TEST_START } from '../../../support/identity';
import { floorWorld } from './floor-world';

// Regras de borda da comanda: concorrência (RN-ORD-21), isolamento (RN-ORD-01), numeração
// (RN-ORD-04), idempotência (RN-ORD-11) e consistência garantida pelo banco.

const { db } = useTestDatabase();
/** ER_CHECK_CONSTRAINT_VIOLATED */
const CHECK_VIOLATION = 3819;
const w = floorWorld(db);
const mesa = (table: string) => ({ table });
const only = <T>(values: readonly T[]): T => {
  const [value] = values;
  if (value === undefined) throw new Error('lista vazia');
  return value;
};

async function settle<T>(work: Promise<T>) {
  try {
    return { ok: true as const, value: await work };
  } catch (error) {
    return { ok: false as const, code: (error as { code?: string }).code, error };
  }
}

beforeEach(async () => {
  w.services.clock.set(TEST_START);
  await w.first('joão', 'GARCOM');
  await w.person('ana', 'GARCOM');
  await w.person('carla', 'GERENTE');
  await w.sells('X-Burger', '32,00', { modifier: ['Bacon', '5,00'] });
  await w.recipe('PRODUCT', 'X-Burger', '150', 'Carne moída');
  await w.stockOf('Carne moída', '1');
  for (const number of ['1', '2', '3', '4', '5']) await w.createTable(number);
});

describe('concorrência na mesma conta (RN-ORD-21)', () => {
  it('dois garçons lançando ao mesmo tempo: os dois itens entram', async () => {
    await w.open('joão', '1');
    const results = await Promise.all([
      settle(w.add('joão', mesa('1'), 1, 'X-Burger')),
      settle(w.add('ana', mesa('1'), 2, 'X-Burger')),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect((await w.order('1')).pending.map((item) => item.quantity).sort()).toEqual([1, 2]);
  });

  it('dois envios dos mesmos itens ao mesmo tempo: um envia, o outro recebe ITEMS_CHANGED', async () => {
    await w.open('joão', '1');
    await w.add('joão', mesa('1'), 2, 'X-Burger');
    const itemIds = await w.pendingIds('1');
    const orderId = await w.orderOfTable('1');
    const send = (by: string) =>
      settle(w.services.orders.sendRound(w.ctx(by), { orderId, itemIds, idempotencyKey: newId() }));
    const results = await Promise.all([send('joão'), send('ana')]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ code: 'ITEMS_CHANGED' });
    expect((await w.order('1')).rounds).toHaveLength(1);
    // O estoque baixou uma vez só: 2 × 150 g
    await w.expectBalance('Carne moída', '700.000');
  });

  it('duas pessoas abrindo a mesma mesa: só uma conta', async () => {
    const results = await Promise.all([settle(w.open('joão', '1')), settle(w.open('ana', '1'))]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ code: 'TABLE_NOT_AVAILABLE' });
    const open = await db
      .select({ id: customerOrder.id })
      .from(customerOrder)
      .where(eq(customerOrder.storeId, w.org.centro));
    expect(open).toHaveLength(1);
  });

  it('aberturas simultâneas recebem números diferentes e seguidos (RN-ORD-04)', async () => {
    await Promise.all(['1', '2', '3', '4', '5'].map((table) => w.open('joão', table)));
    await w.openCounter('ana', 'Balcão Maria');
    const numbers = await db
      .select({ number: customerOrder.number })
      .from(customerOrder)
      .where(eq(customerOrder.storeId, w.org.centro));
    expect(numbers.map((row) => row.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('o número recomeça no dia operacional seguinte', async () => {
    await w.open('joão', '1');
    w.services.clock.advanceHours(24);
    await w.open('joão', '2');
    expect((await w.order('2')).number).toBe(1);
  });

  it('ação sobre a conta inteira com versão velha: CONCURRENT_MODIFICATION', async () => {
    await w.open('joão', '1');
    const orderId = await w.orderOfTable('1');
    const stale = await w.version('1');
    await w.add('ana', mesa('1'), 1, 'X-Burger');
    await w.send('ana', '1');
    const result = await settle(
      w.services.orders.requestBill(w.ctx('joão'), { orderId, version: stale }),
    );
    expect(result).toMatchObject({ ok: false, code: 'CONCURRENT_MODIFICATION' });
  });

  it('dois cancelamentos do mesmo item: um cancela, o estoque volta uma vez', async () => {
    await w.open('joão', '1');
    await w.add('joão', mesa('1'), 1, 'X-Burger');
    await w.send('joão', '1');
    const { id } = await w.sentItem('1', 0);
    const cancel = () =>
      settle(w.services.orders.cancelItem(w.ctx('carla'), { itemId: id, reason: 'desistiu' }));
    const results = await Promise.all([cancel(), cancel()]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ code: 'ITEM_ALREADY_CANCELLED' });
    await w.expectBalance('Carne moída', '1000.000');
  });

  it('juntar enquanto a outra mesa envia: tudo termina na conta de destino', async () => {
    await w.open('joão', '1');
    await w.open('ana', '2');
    await w.add('ana', mesa('2'), 1, 'X-Burger');
    const sourceOrder = await w.orderOfTable('2');
    const itemIds = await w.pendingIds('2');
    const results = await Promise.all([
      settle(w.join('joão', '2', '1')),
      settle(
        w.services.orders.sendRound(w.ctx('ana'), {
          orderId: sourceOrder,
          itemIds,
          idempotencyKey: newId(),
        }),
      ),
    ]);
    const [joined, sent] = results;
    expect(joined.ok).toBe(true);
    // O envio passou antes da junção, ou chegou depois e encontrou a conta encerrada
    if (!sent.ok) expect(sent).toMatchObject({ code: 'ORDER_NOT_OPEN' });
    const items = await db
      .select({ orderId: orderItem.orderId })
      .from(orderItem)
      .where(eq(orderItem.id, only(itemIds)));
    expect(items[0]?.orderId).toBe(await w.orderOfTable('1'));
  });
});

describe('isolamento entre lojas (RN-ORD-01, RN-TAB-01)', () => {
  it('garçom da Praia não vê nem mexe na conta, no item e na mesa do Centro', async () => {
    await w.personAt('pedro', 'GARCOM', 'Praia');
    await w.open('joão', '1');
    await w.add('joão', mesa('1'), 1, 'X-Burger');
    const orderId = await w.orderOfTable('1');
    const itemId = only(await w.pendingIds('1'));
    const praia = w.ctx('pedro');
    const attempts = await Promise.all([
      settle(w.services.orders.getOrder(praia, orderId)),
      settle(w.services.orders.removeItem(praia, { itemId })),
      settle(w.services.orders.openTable(praia, { tableId: w.table('2') })),
      settle(
        w.services.orders.addItem(praia, {
          orderId,
          productId: w.product('X-Burger'),
          quantity: 1,
        }),
      ),
      settle(w.services.tables.releaseTable(praia, { tableId: w.table('1') })),
    ]);
    expect(attempts.map((result) => (result.ok ? 'ok' : result.code))).toEqual([
      'ORDER_NOT_FOUND',
      'ORDER_ITEM_NOT_FOUND',
      'TABLE_NOT_FOUND',
      'ORDER_NOT_FOUND',
      'TABLE_NOT_FOUND',
    ]);
    const floor = await w.services.orders.floor(praia);
    expect(floor.tables).toEqual([]);
    expect(floor.counter).toEqual([]);
  });

  it('juntar e transferir com mesa de outra loja: não encontrada', async () => {
    const foreign = newId();
    await db.insert(diningTable).values({ id: foreign, storeId: w.org.praia, number: '77' });
    await w.open('joão', '1');
    const orderId = await w.orderOfTable('1');
    const version = await w.version('1');
    const results = await Promise.all([
      settle(w.services.orders.join(w.ctx('joão'), { orderId, version, tableId: foreign })),
      settle(
        w.services.orders.transfer(w.ctx('joão'), {
          orderId,
          version,
          fromTableId: w.table('1'),
          toTableId: foreign,
        }),
      ),
    ]);
    expect(results.map((result) => (result.ok ? 'ok' : result.code))).toEqual([
      'TABLE_NOT_FOUND',
      'TABLE_NOT_FOUND',
    ]);
  });
});

describe('permissões e entradas', () => {
  it('cozinha não abre conta nem lança', async () => {
    await w.person('rui', 'COZINHA');
    const result = await settle(w.open('rui', '1'));
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('chave de envio reaproveitada em outro pedido: IDEMPOTENCY_KEY_REUSED', async () => {
    await w.open('joão', '1');
    await w.add('joão', mesa('1'), 1, 'X-Burger');
    await w.send('joão', '1', 'k');
    await w.add('joão', mesa('1'), 1, 'X-Burger');
    const result = await settle(w.send('joão', '1', 'k'));
    expect(result).toMatchObject({ ok: false, code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('adicional de outro produto e quantidade fora da faixa são recusados', async () => {
    await w.sells('Suco', '9,00', { modifier: ['Gelo', '0,00'] });
    await w.open('joão', '1');
    const orderId = await w.orderOfTable('1');
    const menu = await w.services.orders.menu(w.ctx('joão'));
    const gelo = only(
      only(menu.filter((item) => item.name === 'Suco')).modifierGroups.flatMap((group) =>
        group.options.map((option) => option.id),
      ),
    );
    const results = await Promise.all([
      settle(
        w.services.orders.addItem(w.ctx('joão'), {
          orderId,
          productId: w.product('X-Burger'),
          quantity: 1,
          modifierIds: [gelo],
        }),
      ),
      settle(
        w.services.orders.addItem(w.ctx('joão'), {
          orderId,
          productId: w.product('X-Burger'),
          quantity: 100,
        }),
      ),
    ]);
    expect(results.map((result) => (result.ok ? 'ok' : result.code))).toEqual([
      'INVALID_MODIFIERS',
      'INVALID_ITEM_QUANTITY',
    ]);
  });

  it('conta de balcão não pede conta nem transfere (só mesa)', async () => {
    await w.openCounter('joão', 'Maria');
    const orderId = w.counter('Maria');
    const detail = await w.services.orders.getOrder(w.ctx('joão'), orderId);
    const result = await settle(
      w.services.orders.requestBill(w.ctx('joão'), { orderId, version: detail.version }),
    );
    expect(result).toMatchObject({ ok: false, code: 'NOT_A_TABLE_ORDER' });
  });

  it('item sem preparo cancelado antes de entregar volta ao estoque', async () => {
    await w.sells('Água', '5,00', { noPrep: true });
    await w.recipe('PRODUCT', 'Água', '1', 'Garrafa');
    await w.stockOf('Garrafa', '1');
    await w.open('joão', '1');
    await w.add('joão', mesa('1'), 1, 'Água');
    await w.send('joão', '1');
    await w.expectBalance('Garrafa', '999.000');
    await w.cancel('carla', '1', 0, 'cliente trocou');
    await w.expectBalance('Garrafa', '1000.000');
    expect(await w.losses()).toBe(0);
  });
});

describe('consistência garantida pelo banco (migration 0008)', () => {
  const violation = async (work: Promise<unknown>) => {
    const result = await settle(work);
    return result.ok ? null : mysqlErrno(result.error);
  };

  it('mesa livre não guarda conta; mesa ocupada precisa de conta', async () => {
    await w.open('joão', '1');
    const orderId = await w.orderOfTable('1');
    expect(
      await violation(
        db
          .update(diningTable)
          .set({ status: 'LIVRE' })
          .where(eq(diningTable.id, w.table('1'))),
      ),
    ).toBe(CHECK_VIOLATION);
    expect(
      await violation(
        db
          .update(diningTable)
          .set({ status: 'OCUPADA', currentOrderId: null })
          .where(eq(diningTable.id, w.table('2'))),
      ),
    ).toBe(CHECK_VIOLATION);
    expect(orderId).toBeDefined();
  });

  it('item pendente não tem rodada; cancelado tem motivo; quantidade de 1 a 99', async () => {
    await w.open('joão', '1');
    await w.add('joão', mesa('1'), 1, 'X-Burger');
    const itemId = only(await w.pendingIds('1'));
    const set = (data: Partial<typeof orderItem.$inferInsert>) =>
      violation(db.update(orderItem).set(data).where(eq(orderItem.id, itemId)));
    expect(await set({ status: 'ENVIADO' })).toBe(CHECK_VIOLATION);
    expect(await set({ quantity: 0 })).toBe(CHECK_VIOLATION);
    expect(await set({ quantity: 100 })).toBe(CHECK_VIOLATION);
    expect(await set({ cancelReason: 'x' })).toBe(CHECK_VIOLATION);
  });
});
