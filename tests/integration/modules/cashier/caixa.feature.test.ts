import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { money, posWorld } from '../pos/pos-world';

const feature = await loadFeature('tests/features/cashier/caixa.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = posWorld(db);

  Background(({ Given, And }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.first('carla', 'GERENTE'));
    And('"bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"', () =>
      w.withTerminal('bia', 'CAIXA', 'CX01'),
    );
  });

  Scenario('Abrir o caixa no terminal', ({ When, Then, And }) => {
    When('"bia" abre o caixa com "150,00" de fundo de troco', () => w.openCash('bia', '150,00'));
    Then('o caixa do terminal "CX01" está aberto com "150,00" de fundo', async () => {
      const screen = await w.services.cashier.current(w.ctx('bia'));
      expect(screen.terminal?.code).toBe('CX01');
      expect(screen.session).toMatchObject({ status: 'ABERTA', openingAmountCents: 15000 });
    });
    And('a auditoria registra "CASH_OPENED" feito por "bia"', () =>
      w.expectAudit('CASH_OPENED', 'bia'),
    );
  });

  Scenario('Aparelho que não é terminal de caixa não abre caixa', ({ Given, When, Then }) => {
    Given('"dani" é caixa na loja "Centro" sem terminal', () =>
      w.withTerminal('dani', 'CAIXA', null),
    );
    When('"dani" tenta abrir o caixa com "100,00" de fundo de troco', () =>
      w.attempt(() => w.openCash('dani', '100,00')),
    );
    Then('a ação é recusada com o código "TERMINAL_REQUIRED"', () => {
      w.expectFailure('TERMINAL_REQUIRED');
    });
  });

  Scenario('Um caixa aberto por terminal', ({ Given, When, Then }) => {
    Given('"bia" abriu o caixa com "150,00" de fundo de troco', () => w.openCash('bia', '150,00'));
    When('"bia" tenta abrir o caixa com "50,00" de fundo de troco', () =>
      w.attempt(() => w.openCash('bia', '50,00')),
    );
    Then('a ação é recusada com o código "CASH_ALREADY_OPEN"', () => {
      w.expectFailure('CASH_ALREADY_OPEN');
    });
  });

  Scenario('Sangria e suprimento com motivo', ({ Given, When, And, Then }) => {
    Given('"bia" abriu o caixa com "150,00" de fundo de troco', () => w.openCash('bia', '150,00'));
    When('"bia" faz um suprimento de "50,00" pelo motivo "troco extra"', () =>
      w.movement('bia', 'SUPRIMENTO', '50,00', 'troco extra'),
    );
    And('"bia" faz uma sangria de "120,00" pelo motivo "depósito no cofre"', () =>
      w.movement('bia', 'SANGRIA', '120,00', 'depósito no cofre'),
    );
    Then('o dinheiro esperado na gaveta é "80,00"', async () => {
      expect(money(await w.expectedCash('bia'))).toBe('80,00');
    });
  });

  Scenario(
    'Sangria maior que o dinheiro da gaveta é aceita e aparece ao gerente no fechamento',
    ({ Given, When, And, Then }) => {
      Given('"bia" abriu o caixa com "100,00" de fundo de troco', () =>
        w.openCash('bia', '100,00'),
      );
      When('"bia" faz uma sangria de "150,00" pelo motivo "depósito"', () =>
        w.movement('bia', 'SANGRIA', '150,00', 'depósito'),
      );
      And('"bia" fecha o caixa informando "0,00" em dinheiro e "0,00" no PIX', () =>
        w.closeCash('bia', { DINHEIRO: '0,00', PIX: '0,00' }),
      );
      Then('a conferência aponta a sangria de "150,00" acima do esperado', async () => {
        const summary = await w.services.cashier.summary(w.ctx('carla'), w.lastSessionId);
        expect(summary.alerts).toEqual([
          expect.objectContaining({ type: 'SANGRIA', amountCents: -15000, reason: 'depósito' }),
        ]);
      });
    },
  );

  Scenario('Fechamento cego mostra a diferença', ({ Given, And, When, Then }) => {
    Given('"bia" abriu o caixa com "100,00" de fundo de troco', () => w.openCash('bia', '100,00'));
    And('"bia" recebeu "45,50" em dinheiro e "30,00" no PIX de uma conta de balcão', async () => {
      await w.counterWith('bia', 'Rafa', '75,50');
      await w.pay('bia', { counter: 'Rafa' }, 'DINHEIRO', '45,50');
      await w.pay('bia', { counter: 'Rafa' }, 'PIX', '30,00');
    });
    When('"bia" fecha o caixa informando "140,00" em dinheiro e "30,00" no PIX', () =>
      w.closeCash('bia', { DINHEIRO: '140,00', PIX: '30,00' }),
    );
    Then(
      'o fechamento mostra em dinheiro esperado "145,50", informado "140,00" e diferença "-5,50"',
      () => {
        expect(w.lastCounts.find((line) => line.method === 'DINHEIRO')).toEqual({
          method: 'DINHEIRO',
          expectedCents: 14550,
          declaredCents: 14000,
          differenceCents: -550,
        });
      },
    );
    And('o fechamento mostra no PIX esperado "30,00", informado "30,00" e diferença "0,00"', () => {
      expect(w.lastCounts.find((line) => line.method === 'PIX')).toEqual({
        method: 'PIX',
        expectedCents: 3000,
        declaredCents: 3000,
        differenceCents: 0,
      });
    });
    And('a auditoria registra "CASH_CLOSED" feito por "bia"', () =>
      w.expectAudit('CASH_CLOSED', 'bia'),
    );
  });

  Scenario('Dinheiro é obrigatório no fechamento', ({ Given, When, Then }) => {
    Given('"bia" abriu o caixa com "100,00" de fundo de troco', () => w.openCash('bia', '100,00'));
    When('"bia" tenta fechar o caixa sem informar o dinheiro', () =>
      w.attempt(() => w.closeCash('bia', { PIX: '0,00' })),
    );
    Then('a ação é recusada com o código "CASH_COUNT_REQUIRED"', () => {
      w.expectFailure('CASH_COUNT_REQUIRED');
    });
  });

  Scenario('Garçom não abre caixa', ({ Given, When, Then }) => {
    Given('"joão" é garçom na loja "Centro" usando o terminal de caixa "CX02"', () =>
      w.withTerminal('joão', 'GARCOM', 'CX02'),
    );
    When('"joão" tenta abrir o caixa com "100,00" de fundo de troco', () =>
      w.attempt(() => w.openCash('joão', '100,00')),
    );
    Then('a ação é recusada com o código "FORBIDDEN"', () => {
      w.expectFailure('FORBIDDEN');
    });
  });
});
