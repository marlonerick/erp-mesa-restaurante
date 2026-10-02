import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { posBackground } from './pos-background';
import { money, posWorld } from './pos-world';

const feature = await loadFeature('tests/features/pos/pagamento.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = posWorld(db);
  const mesa10 = { table: '10' };
  const opened = () => w.openCash('bia', '100,00');

  const balanceIs = (count: number, balance: string) => async () => {
    const detail = await w.bill(mesa10);
    expect(detail.payments.filter((item) => item.status === 'ATIVO')).toHaveLength(count);
    expect(money(detail.totals.balanceCents)).toBe(balance);
  };

  Background(({ Given, And }) => {
    posBackground(w, Given, And);
  });

  Scenario(
    'Pagamento misto com troco fecha a conta e libera a mesa para limpeza',
    ({ Given, When, And, Then }) => {
      Given('"bia" abriu o caixa com "100,00" de fundo de troco', opened);
      When('"bia" recebe "50,00" no PIX da mesa "10"', () => w.pay('bia', mesa10, 'PIX', '50,00'));
      And('"bia" recebe "30,00" em dinheiro da mesa "10"', () =>
        w.pay('bia', mesa10, 'DINHEIRO', '30,00'),
      );
      Then('o troco é "1,90"', () => {
        expect(w.lastPay).toMatchObject({ amountCents: 2810, changeCents: 190, closed: true });
      });
      And('a conta da mesa "10" está "FECHADO" com total "78,10"', async () => {
        const detail = await w.bill(mesa10);
        expect(detail.order.status).toBe('FECHADO');
        expect(money(detail.totals.totalCents)).toBe('78,10');
      });
      And('a mesa "10" está "LIMPEZA"', async () => {
        expect(await w.tableStatus('10')).toBe('LIMPEZA');
      });
      And('o dinheiro esperado na gaveta é "128,10"', async () => {
        expect(money(await w.expectedCash('bia'))).toBe('128,10');
      });
      And('a auditoria registra "ORDER_CLOSED" feito por "bia"', () =>
        w.expectAudit('ORDER_CLOSED', 'bia'),
      );
    },
  );

  Scenario('Pagamento reenviado por perda de conexão não duplica', ({ Given, And, When, Then }) => {
    Given('"bia" abriu o caixa com "100,00" de fundo de troco', opened);
    And('"bia" recebeu "20,00" no PIX da mesa "10" com a chave "abc-123"', () =>
      w.pay('bia', mesa10, 'PIX', '20,00', { key: 'abc-123' }),
    );
    When('"bia" reenvia o pagamento de "20,00" no PIX da mesa "10" com a chave "abc-123"', () =>
      w.pay('bia', mesa10, 'PIX', '20,00', { key: 'abc-123' }),
    );
    Then('a mesa "10" tem 1 pagamento e falta pagar "58,10"', balanceIs(1, '58,10'));
  });

  Scenario('Sem caixa aberto não recebe', ({ When, Then }) => {
    When('"bia" tenta receber "20,00" no PIX da mesa "10"', () =>
      w.attempt(() => w.pay('bia', mesa10, 'PIX', '20,00')),
    );
    Then('a ação é recusada com o código "CASH_NOT_OPEN"', () => {
      w.expectFailure('CASH_NOT_OPEN');
    });
  });

  Scenario('Cartão não pode passar do que falta', ({ Given, When, Then }) => {
    Given('"bia" abriu o caixa com "100,00" de fundo de troco', opened);
    When('"bia" tenta receber "100,00" no cartão de crédito da mesa "10"', () =>
      w.attempt(() => w.pay('bia', mesa10, 'CARTAO_CREDITO', '100,00')),
    );
    Then('a ação é recusada com o código "PAYMENT_EXCEEDS_BALANCE"', () => {
      w.expectFailure('PAYMENT_EXCEEDS_BALANCE');
    });
  });

  Scenario('Cancelar pagamento com PIN do gerente', ({ Given, And, When, Then }) => {
    Given('"bia" abriu o caixa com "100,00" de fundo de troco', opened);
    And('"bia" recebeu "20,00" em dinheiro da mesa "10"', () =>
      w.pay('bia', mesa10, 'DINHEIRO', '20,00'),
    );
    And(
      '"carla" autorizou no aparelho de "bia" o cancelamento de pagamento com o PIN "246810"',
      () => w.authorizeFor('carla', 'bia', 'payments.cancel', '246810'),
    );
    When('"bia" cancela o primeiro pagamento da mesa "10" pelo motivo "valor errado"', () =>
      w.cancelPayment('bia', '10', 0, 'valor errado'),
    );
    Then('a mesa "10" tem 0 pagamento e falta pagar "78,10"', balanceIs(0, '78,10'));
    And('o dinheiro esperado na gaveta é "100,00"', async () => {
      expect(money(await w.expectedCash('bia'))).toBe('100,00');
    });
    And('a auditoria registra "PAYMENT_CANCELLED" feito por "bia" com autorização de "carla"', () =>
      w.expectAudit('PAYMENT_CANCELLED', 'bia', 'carla'),
    );
  });

  Scenario('Desconto depois do primeiro pagamento é recusado', ({ Given, And, When, Then }) => {
    Given('"bia" abriu o caixa com "100,00" de fundo de troco', opened);
    And('"bia" recebeu "20,00" em dinheiro da mesa "10"', () =>
      w.pay('bia', mesa10, 'DINHEIRO', '20,00'),
    );
    When(
      '"carla" tenta dar desconto de "10" por cento na conta da mesa "10" pelo motivo "cortesia"',
      () => w.attempt(() => w.discountOrder('carla', mesa10, 'PERCENTUAL', 1000, 'cortesia')),
    );
    Then('a ação é recusada com o código "PAYMENTS_STARTED"', () => {
      w.expectFailure('PAYMENTS_STARTED');
    });
  });

  Scenario('Com pagamento na conta, a comanda não cancela item', ({ Given, And, When, Then }) => {
    Given('"bia" abriu o caixa com "100,00" de fundo de troco', opened);
    And('"bia" recebeu "20,00" em dinheiro da mesa "10"', () =>
      w.pay('bia', mesa10, 'DINHEIRO', '20,00'),
    );
    When('"carla" tenta cancelar o primeiro item da mesa "10" pelo motivo "cliente desistiu"', () =>
      w.attempt(() => w.cancel('carla', '10', 0, 'cliente desistiu')),
    );
    Then('a ação é recusada com o código "PAYMENTS_STARTED"', () => {
      w.expectFailure('PAYMENTS_STARTED');
    });
  });
});
