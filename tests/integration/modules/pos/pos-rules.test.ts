import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { mysqlErrno } from '@/shared/db/mysql-errors';
import { customerOrder, payment, store } from '@/shared/db/schema';
import { newId } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import { TEST_START } from '../../../support/identity';
import { cents, posWorld } from './pos-world';

// Regras de borda do caixa e do PDV: concorrência (RN-CASH-08, RN-POS-16), isolamento entre lojas,
// limites, taxa congelada (RN-POS-03) e garantias do banco.

const { db } = useTestDatabase();
/** ER_CHECK_CONSTRAINT_VIOLATED */
const CHECK_VIOLATION = 3819;
const w = posWorld(db);
const mesa = (table: string) => ({ table });

async function settle<T>(work: Promise<T>) {
  try {
    return { ok: true as const, value: await work };
  } catch (error) {
    return { ok: false as const, code: (error as { code?: string }).code, error };
  }
}

beforeEach(async () => {
  w.services.clock.set(TEST_START);
  await w.first('carla', 'GERENTE', '246810');
  await w.withTerminal('bia', 'CAIXA', 'CX01');
  await w.withTerminal('rui', 'CAIXA', 'CX02');
  await w.person('joão', 'GARCOM');
  await w.sells('X-Burger', '32,00');
  for (const number of ['1', '2']) await w.createTable(number);
  // Dois caixas abertos ao mesmo tempo nesta loja (Q-05)
  await db.update(store).set({ maxOpenCashSessions: 2 }).where(eq(store.id, w.org.centro));
  await w.sendTo('joão', '1', [{ quantity: 1, product: 'X-Burger' }]);
});

describe('concorrência (RN-POS-16, RN-CASH-08)', () => {
  it('dois caixas recebendo o que falta ao mesmo tempo: um recebe, o outro é recusado', async () => {
    await w.openCash('bia', '0,00');
    await w.openCash('rui', '0,00');
    // Total: 32,00 + 10% = 35,20
    const results = await Promise.all([
      settle(w.pay('bia', mesa('1'), 'PIX', '35,20')),
      settle(w.pay('rui', mesa('1'), 'CARTAO_DEBITO', '35,20')),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(['ORDER_NOT_OPEN', 'PAYMENT_EXCEEDS_BALANCE']).toContain(
      results.find((result) => !result.ok)?.code,
    );
    const detail = await w.bill(mesa('1'));
    expect(detail.order).toMatchObject({ status: 'FECHADO', paidCents: 3520 });
    expect(detail.payments).toHaveLength(1);
  });

  it('receber enquanto o caixa fecha: ou o pagamento entra no esperado, ou é recusado', async () => {
    await w.openCash('bia', '0,00');
    const before = await w.services.cashier.current(w.ctx('bia'));
    const session = before.session;
    if (!session) throw new Error('caixa não abriu');
    const [paid, closed] = await Promise.all([
      settle(w.pay('bia', mesa('1'), 'PIX', '10,00')),
      settle(
        w.services.cashier.close(w.ctx('bia'), {
          sessionId: session.id,
          version: session.version,
          declared: { DINHEIRO: 0, PIX: 1000 },
          idempotencyKey: newId(),
        }),
      ),
    ]);
    expect(closed.ok).toBe(true);
    const pix = closed.ok ? closed.value.counts.find((line) => line.method === 'PIX') : undefined;
    if (paid.ok) {
      expect(pix).toMatchObject({ expectedCents: 1000, differenceCents: 0 });
    } else {
      expect(['CASH_NOT_OPEN', 'CASH_SESSION_CLOSED']).toContain(paid.code);
      expect(pix).toMatchObject({ expectedCents: 0 });
    }
  });

  it('duas aberturas no mesmo terminal ao mesmo tempo: só um caixa', async () => {
    const results = await Promise.all([
      settle(w.openCash('bia', '10,00')),
      settle(w.openCash('bia', '20,00')),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)?.code).toBe('CASH_ALREADY_OPEN');
  });

  it('o reenvio do pagamento ao mesmo tempo que o original não duplica', async () => {
    await w.openCash('bia', '0,00');
    const results = await Promise.all([
      settle(w.pay('bia', mesa('1'), 'PIX', '10,00', { key: 'k1' })),
      settle(w.pay('bia', mesa('1'), 'PIX', '10,00', { key: 'k1' })),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    const detail = await w.bill(mesa('1'));
    expect(detail.payments).toHaveLength(1);
    expect(detail.order.paidCents).toBe(1000);
  });
});

describe('limites e permissões', () => {
  it('limite de caixas abertos da loja (Q-05)', async () => {
    await db.update(store).set({ maxOpenCashSessions: 1 }).where(eq(store.id, w.org.centro));
    await w.openCash('bia', '0,00');
    await w.attempt(() => w.openCash('rui', '0,00'));
    w.expectFailure('CASH_LIMIT_REACHED');
  });

  it('garçom não tem limite de desconto: qualquer desconto pede o PIN', async () => {
    await w.attempt(() => w.discountOrder('joão', mesa('1'), 'VALOR', 100, 'cortesia'));
    w.expectFailure('FORBIDDEN');
    await w.authorizeFor('carla', 'joão', 'discounts.apply_above_limit', '246810');
    await w.discountOrder('joão', mesa('1'), 'VALOR', 100, 'cortesia');
    expect((await w.bill(mesa('1'))).totals.orderDiscountCents).toBe(100);
  });

  it('caixa dá até 10% sem PIN; desconto maior que o valor é recusado', async () => {
    // 10% de 32,00 = 3,20: no limite
    await w.discountOrder('bia', mesa('1'), 'VALOR', 320, 'cliente frequente');
    await w.attempt(() => w.discountOrder('carla', mesa('1'), 'VALOR', 3300, 'cortesia'));
    w.expectFailure('DISCOUNT_TOO_HIGH');
  });

  it('cancelar pagamento depois de o caixa fechar é recusado', async () => {
    await w.openCash('bia', '0,00');
    await w.pay('bia', mesa('1'), 'PIX', '10,00');
    await w.closeCash('bia', { DINHEIRO: '0,00' });
    await w.attempt(() => w.cancelPayment('carla', '1', 0, 'valor errado'));
    w.expectFailure('CASH_SESSION_CLOSED');
  });

  it('com pagamento, a conta não junta com outra mesa', async () => {
    await w.openCash('bia', '0,00');
    await w.pay('bia', mesa('1'), 'PIX', '10,00');
    await w.attempt(() => w.join('joão', '2', '1'));
    w.expectFailure('PAYMENTS_STARTED');
  });

  it('conta fechada não recebe mais', async () => {
    await w.openCash('bia', '0,00');
    await w.pay('bia', mesa('1'), 'PIX', '35,20');
    await w.attempt(() => w.pay('bia', mesa('1'), 'PIX', '1,00'));
    w.expectFailure('ORDER_NOT_OPEN');
  });
});

describe('isolamento entre lojas (ADR-0009)', () => {
  it('o caixa da Praia não vê nem recebe a conta do Centro', async () => {
    await w.personAt('lia', 'CAIXA', 'Praia');
    const orderId = await w.orderId(mesa('1'));
    await w.attempt(() => w.services.pos.bill(w.ctx('lia'), orderId));
    w.expectFailure('ORDER_NOT_FOUND');
    await w.attempt(() =>
      w.services.pos.pay(w.ctx('lia'), {
        orderId,
        method: 'PIX',
        amountCents: 100,
        idempotencyKey: newId(),
      }),
    );
    w.expectFailure('ORDER_NOT_FOUND');
    expect(await w.services.pos.receivables(w.ctx('lia'))).toEqual([]);
  });

  it('o caixa do Centro não aparece nem fecha pela Praia', async () => {
    await w.openCash('bia', '0,00');
    const screen = await w.services.cashier.current(w.ctx('bia'));
    await w.personAt('lia', 'CAIXA', 'Praia');
    await w.attempt(() => w.services.cashier.summary(w.ctx('lia'), screen.session?.id ?? newId()));
    w.expectFailure('CASH_SESSION_NOT_FOUND');
  });
});

describe('taxa congelada e contas a receber', () => {
  it('mudar a taxa da loja não altera a conta já aberta (RN-POS-03)', async () => {
    await db.update(store).set({ serviceFeeBp: 1500 }).where(eq(store.id, w.org.centro));
    expect((await w.bill(mesa('1'))).totals).toMatchObject({
      serviceFeeBp: 1000,
      totalCents: 3520,
    });
    await w.sendTo('joão', '2', [{ quantity: 1, product: 'X-Burger' }]);
    expect((await w.bill(mesa('2'))).totals).toMatchObject({
      serviceFeeBp: 1500,
      totalCents: 3680,
    });
  });

  it('contas a receber mostram total, pago e o que falta', async () => {
    await w.openCash('bia', '0,00');
    await w.pay('bia', mesa('1'), 'PIX', '10,00');
    const [row] = await w.services.pos.receivables(w.ctx('bia'));
    expect(row?.totals).toMatchObject({ totalCents: 3520, paidCents: 1000, balanceCents: 2520 });
  });
});

describe('garantias do banco', () => {
  it('troco só no dinheiro e recebido = valor + troco', async () => {
    await w.openCash('bia', '0,00');
    await w.pay('bia', mesa('1'), 'DINHEIRO', '50,00');
    const [row] = await db
      .select()
      .from(payment)
      .where(eq(payment.orderId, await w.orderId(mesa('1'))));
    expect(row).toMatchObject({ amountCents: 3520, tenderedCents: 5000, changeCents: 1480 });
    const result = await settle(
      db
        .update(payment)
        .set({ changeCents: 1 })
        .where(eq(payment.id, row?.id ?? newId())),
    );
    expect(result.ok ? null : mysqlErrno(result.error)).toBe(CHECK_VIOLATION);
  });

  it('conta fechada precisa do total congelado e paga por inteiro', async () => {
    const orderId = await w.orderId(mesa('1'));
    const result = await settle(
      db.update(customerOrder).set({ status: 'FECHADO' }).where(eq(customerOrder.id, orderId)),
    );
    expect(result.ok ? null : mysqlErrno(result.error)).toBe(CHECK_VIOLATION);
    expect(cents('1,00')).toBe(100);
  });
});

describe('achados da revisão da Etapa 8', () => {
  it('B-1: quem não tem permissão de desconto não retira o desconto da conta', async () => {
    await w.discountOrder('carla', mesa('1'), 'VALOR', 2000, 'cortesia');
    await w.person('téo', 'COZINHA');
    for (const who of ['téo', 'joão']) {
      await w.attempt(() => w.discountOrder(who, mesa('1'), 'VALOR', 0, ''));
      w.expectFailure('FORBIDDEN');
    }
    expect((await w.bill(mesa('1'))).totals.orderDiscountCents).toBe(2000);
  });

  it('I-1: pagar por valor e depois por TODOS os itens cobra exatamente o que falta', async () => {
    await w.sells('Batata', '35,20', { noPrep: true });
    await w.sendTo('joão', '2', [
      { quantity: 1, product: 'Batata' },
      { quantity: 1, product: 'Batata' },
    ]);
    await w.openCash('bia', '0,00');
    // Total 70,40 + 10% = 77,44; paga 60,00 e depois "os dois itens"
    await w.pay('bia', mesa('2'), 'PIX', '60,00');
    const items = (await w.bill(mesa('2'))).items.map((item) => item.id);
    await w.pay('bia', mesa('2'), 'PIX', null, { itemIds: items });
    expect(w.lastPay).toMatchObject({ amountCents: 1744, closed: true });
  });

  it('I-1: itens que passam do que falta são recusados com mensagem clara', async () => {
    await w.sells('Batata', '35,20', { noPrep: true });
    await w.sendTo('joão', '2', [
      { quantity: 1, product: 'Batata' },
      { quantity: 1, product: 'Batata' },
    ]);
    await w.openCash('bia', '0,00');
    await w.pay('bia', mesa('2'), 'PIX', '60,00');
    const [first] = (await w.bill(mesa('2'))).items;
    await w.attempt(() =>
      w.pay('bia', mesa('2'), 'PIX', null, { itemIds: [first?.id ?? newId()] }),
    );
    w.expectFailure('ITEMS_EXCEED_BALANCE');
  });

  it('I-2: conta com cortesia de 100% fecha sem valor e a mesa vai para limpeza', async () => {
    await w.attempt(() => w.services.pos.closeFree(w.ctx('bia'), { orderId: newId() }));
    w.expectFailure('ORDER_NOT_FOUND');
    const orderId = await w.orderId(mesa('1'));
    await w.attempt(() => w.services.pos.closeFree(w.ctx('bia'), { orderId }));
    w.expectFailure('BILL_NOT_FREE');
    await w.discountOrder('carla', mesa('1'), 'PERCENTUAL', 10_000, 'cortesia da casa');
    await w.services.pos.closeFree(w.ctx('bia'), { orderId });
    expect((await w.bill(mesa('1'))).order).toMatchObject({ status: 'FECHADO', paidCents: 0 });
    expect(await w.tableStatus('1')).toBe('LIMPEZA');
  });

  it('erros de pagamento: balcão sem taxa, dinheiro insuficiente, cancelado de novo, chave reusada', async () => {
    await w.openCash('bia', '0,00');
    await w.sendToCounter('joão', 'Ana', 1, 'X-Burger');
    await w.attempt(() =>
      w.services.pos.serviceFee(w.ctx('carla'), {
        orderId: w.counter('Ana'),
        waived: true,
        reason: 'teste',
      }),
    );
    w.expectFailure('NO_SERVICE_FEE');

    const [item] = (await w.bill(mesa('1'))).items;
    await w.attempt(() =>
      w.pay('bia', mesa('1'), 'DINHEIRO', '1,00', { itemIds: [item?.id ?? newId()] }),
    );
    w.expectFailure('TENDERED_TOO_LOW');

    await w.pay('bia', mesa('1'), 'PIX', '10,00', { key: 'k-reuso' });
    await w.attempt(() => w.pay('bia', mesa('1'), 'PIX', '11,00', { key: 'k-reuso' }));
    w.expectFailure('IDEMPOTENCY_KEY_REUSED');

    await w.cancelPayment('carla', '1', 0, 'valor errado');
    await w.attempt(() => w.cancelPayment('carla', '1', 0, 'de novo'));
    w.expectFailure('PAYMENT_ALREADY_CANCELLED');
  });

  it('isolamento: pela Praia não dá desconto, pré-conta, taxa nem cancela pagamento do Centro', async () => {
    await w.openCash('bia', '0,00');
    await w.pay('bia', mesa('1'), 'PIX', '10,00');
    const detail = await w.bill(mesa('1'));
    await w.personAt('lia', 'GERENTE', 'Praia');
    const ctx = w.ctx('lia');
    const orderId = detail.order.id;
    const attempts = [
      () => w.services.pos.preBill(ctx, { orderId }),
      () => w.services.pos.discountOrder(ctx, { orderId, mode: 'VALOR', value: 0, reason: '' }),
      () => w.services.pos.serviceFee(ctx, { orderId, waived: true, reason: 'teste' }),
      () =>
        w.services.pos.cancelPayment(ctx, {
          orderId,
          paymentId: detail.payments[0]?.id ?? newId(),
          reason: 'teste',
          idempotencyKey: newId(),
        }),
    ];
    for (const run of attempts) {
      await w.attempt(run);
      w.expectFailure('ORDER_NOT_FOUND');
    }
    expect((await w.bill(mesa('1'))).order.paidCents).toBe(1000);
  });
});
