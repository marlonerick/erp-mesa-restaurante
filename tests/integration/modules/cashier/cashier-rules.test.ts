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
  it('duas sangrias ao mesmo tempo: as duas entram e a segunda é apontada ao gerente', async () => {
    await w.openCash('bia', '100,00');
    const results = await Promise.all([
      settle(w.movement('bia', 'SANGRIA', '80,00', 'depósito no cofre')),
      settle(w.movement('bia', 'SANGRIA', '80,00', 'depósito no cofre')),
    ]);
    // Decisão I-3: sangria acima do esperado é aceita (recusar revelaria o esperado)
    expect(results.every((result) => result.ok)).toBe(true);
    expect(money(await w.expectedCash('bia'))).toBe('-60,00');
    await w.closeCash('bia', { DINHEIRO: '0,00' });
    const summary = await w.services.cashier.summary(w.ctx('carla'), w.lastSessionId);
    // Só a segunda deixou a gaveta negativa (B-2: a soma é lida com trava, nada se perde)
    expect(summary.alerts).toHaveLength(1);
  });

  it('a conferência só existe depois de fechar (fechamento cego)', async () => {
    await w.openCash('bia', '10,00');
    await w.movement('bia', 'SANGRIA', '50,00', 'depósito');
    const open = await w.services.cashier.summary(w.ctx('carla'), w.lastSessionId);
    expect(open).toMatchObject({ counts: null, alerts: null });
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
      // Os dois entram (decisão I-3): a gaveta fica com 20,00 a descoberto e o gerente vê
      expect(expected).toBe(-2000);
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
