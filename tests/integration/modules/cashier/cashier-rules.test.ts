import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import { TEST_START } from '../../../support/identity';
import { money, posWorld } from '../pos/pos-world';

// Regras de borda do caixa: concorrência (RN-CASH-08) e isolamento entre lojas (RN-CASH-01).

const { db } = useTestDatabase();
const w = posWorld(db);

async function settle<T>(work: Promise<T>) {
  try {
    return { ok: true as const, value: await work };
  } catch (error) {
    return { ok: false as const, code: (error as { code?: string }).code };
  }
}

beforeEach(async () => {
  w.services.clock.set(TEST_START);
  await w.first('carla', 'GERENTE', '246810');
  await w.withTerminal('bia', 'CAIXA', 'CX01');
});

describe('concorrência no caixa (RN-CASH-08)', () => {
  it('duas sangrias ao mesmo tempo não deixam a gaveta negativa (achado B-2)', async () => {
    await w.openCash('bia', '100,00');
    const results = await Promise.all([
      settle(w.movement('bia', 'SANGRIA', '80,00', 'depósito no cofre')),
      settle(w.movement('bia', 'SANGRIA', '80,00', 'depósito no cofre')),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)?.code).toBe('CASH_INSUFFICIENT');
    expect(money(await w.expectedCash('bia'))).toBe('20,00');
  });

  it('sangria que espera um estorno em dinheiro enxerga o estorno', async () => {
    await w.openCash('bia', '0,00');
    await w.counterWith('bia', 'Rafa', '50,00');
    await w.pay('bia', { counter: 'Rafa' }, 'DINHEIRO', '20,00');
    const orderId = await w.orderId({ counter: 'Rafa' });
    const [payment] = (await w.services.pos.bill(w.ctx('bia'), orderId)).payments;
    const [refund, withdrawal] = await Promise.all([
      settle(
        w.services.pos.cancelPayment(w.ctx('carla'), {
          orderId,
          paymentId: payment?.id ?? newId(),
          reason: 'valor errado',
          grantToken: null,
          idempotencyKey: newId(),
        }),
      ),
      settle(w.movement('bia', 'SANGRIA', '20,00', 'depósito')),
    ]);
    const expected = await w.expectedCash('bia');
    if (refund.ok && withdrawal.ok) {
      // A sangria passou antes do estorno: a gaveta ficou com o estorno a descoberto (permitido)
      expect(expected).toBe(-2000);
    } else if (refund.ok) {
      expect(withdrawal.code).toBe('CASH_INSUFFICIENT');
      expect(expected).toBe(0);
    } else {
      expect(withdrawal.ok).toBe(true);
      expect(expected).toBe(0);
    }
  });
});

describe('isolamento entre lojas (RN-CASH-01)', () => {
  it('o caixa da Praia não fecha nem vê o caixa do Centro', async () => {
    await w.openCash('bia', '0,00');
    const screen = await w.services.cashier.current(w.ctx('bia'));
    const session = screen.session;
    if (!session) throw new Error('caixa não abriu');
    await w.personAt('lia', 'GERENTE', 'Praia');
    await w.attempt(() =>
      w.services.cashier.close(w.ctx('lia'), {
        sessionId: session.id,
        version: session.version,
        declared: { DINHEIRO: 0 },
        idempotencyKey: newId(),
      }),
    );
    w.expectFailure('CASH_SESSION_NOT_FOUND');
    // E sem terminal de caixa da Praia, a tela da Praia não mostra caixa nenhum
    expect(await w.services.cashier.current(w.ctx('lia'))).toEqual({
      terminal: null,
      session: null,
    });
  });
});
