import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { TODAY } from '../inventory/stock-world';
import { reportsWorld } from '../reports/reports-world';

const feature = await loadFeature('tests/features/finance/financeiro.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = reportsWorld(db);

  Background(({ Given, And }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.first('carla', 'GERENTE'));
    And('"bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"', () =>
      w.withTerminal('bia', 'CAIXA', 'CX01'),
    );
  });

  Scenario(
    'Fechar o caixa gera uma receita de vendas por forma de pagamento',
    ({ Given, And, When, Then }) => {
      Given('"bia" abriu o caixa com "100,00" de fundo de troco', () =>
        w.openCash('bia', '100,00'),
      );
      And('"bia" recebeu "45,50" em dinheiro e "30,00" no PIX de uma conta de balcão', async () => {
        await w.counterWith('bia', 'Rafa', '75,50');
        await w.pay('bia', { counter: 'Rafa' }, 'DINHEIRO', '45,50');
        await w.pay('bia', { counter: 'Rafa' }, 'PIX', '30,00');
      });
      When('"bia" fecha o caixa informando "145,50" em dinheiro', () =>
        w.closeCash('bia', { DINHEIRO: '145,50' }),
      );
      Then(
        'o financeiro tem as receitas de vendas "45,50" em "DINHEIRO" e "30,00" em "PIX", pagas no dia do caixa',
        async () => {
          const sales = await w.salesEntries();
          expect(
            sales
              .map((entry) => ({
                method: entry.paymentMethod,
                amountCents: entry.amountCents,
                status: entry.status,
                paidDate: entry.paidDate,
              }))
              .sort((a, b) => String(a.method).localeCompare(String(b.method))),
          ).toEqual([
            {
              method: 'DINHEIRO',
              amountCents: 4550,
              status: 'PAGO',
              paidDate: TODAY,
            },
            {
              method: 'PIX',
              amountCents: 3000,
              status: 'PAGO',
              paidDate: TODAY,
            },
          ]);
        },
      );
      And('as receitas de vendas não podem ser canceladas', async () => {
        const [sale] = await w.salesEntries();
        if (!sale) throw new Error('sem receita de vendas');
        await w.attempt(() =>
          w.services.finance.cancelEntry(w.ctx('carla'), {
            entryId: sale.id,
            version: sale.version,
            reason: 'teste',
          }),
        );
        w.expectFailure('FINANCE_ENTRY_AUTOMATIC');
      });
    },
  );

  Scenario('Despesa a pagar e depois paga', ({ When, Then, And }) => {
    When(
      '"carla" lança a despesa "Conta de luz" de "350,00" em "Contas de consumo" a pagar em "2026-03-20"',
      () =>
        w.entry('carla', {
          type: 'DESPESA',
          description: 'Conta de luz',
          amount: '350,00',
          category: 'Contas de consumo',
          status: 'PREVISTO',
          date: '2026-03-20',
        }),
    );
    Then('o fluxo de caixa mostra "350,00" a pagar nos próximos dias', async () => {
      const flow = await w.cashFlow(TODAY);
      expect(flow.upcoming.map((entry) => [entry.description, entry.amountCents])).toEqual([
        ['Conta de luz', 35000],
      ]);
      expect(flow.outflowCents).toBe(0);
    });
    When('"carla" paga a despesa "Conta de luz" em "2026-03-14"', () =>
      w.payEntry('carla', 'Conta de luz', '2026-03-14'),
    );
    Then('o fluxo de caixa de "2026-03-14" tem entradas "0,00" e saídas "350,00"', async () => {
      const day = await w.flowOf('2026-03-14');
      w.expectCents(day.inflowCents, '0,00');
      w.expectCents(day.outflowCents, '350,00');
    });
    And('a auditoria registra "FINANCE_ENTRY_PAID" feito por "carla"', () =>
      w.expectAudit('FINANCE_ENTRY_PAID', 'carla'),
    );
  });

  Scenario('Fluxo de caixa com saldo acumulado', ({ Given, And, When, Then }) => {
    let flow: Awaited<ReturnType<typeof w.cashFlow>>;
    Given(
      '"carla" lançou a receita "Evento fechado" de "1.000,00" em "Outras receitas" paga em "2026-03-13"',
      () =>
        w.entry('carla', {
          type: 'RECEITA',
          description: 'Evento fechado',
          amount: '1.000,00',
          category: 'Outras receitas',
          status: 'PAGO',
          date: '2026-03-13',
        }),
    );
    And(
      '"carla" lançou a despesa "Gás" de "180,00" em "Contas de consumo" paga em "2026-03-14"',
      () =>
        w.entry('carla', {
          type: 'DESPESA',
          description: 'Gás',
          amount: '180,00',
          category: 'Contas de consumo',
          status: 'PAGO',
          date: '2026-03-14',
        }),
    );
    When('"carla" vê o fluxo de caixa de "2026-03-13" a "2026-03-14"', async () => {
      flow = await w.services.finance.cashFlow(w.ctx('carla'), {
        from: '2026-03-13',
        to: '2026-03-14',
      });
    });
    Then('o dia "2026-03-13" tem saldo "1.000,00" e acumulado "1.000,00"', () => {
      const day = flow.days.find((item) => item.date === '2026-03-13');
      w.expectCents(day?.netCents ?? NaN, '1.000,00');
      w.expectCents(day?.cumulativeCents ?? NaN, '1.000,00');
    });
    And('o dia "2026-03-14" tem saldo "-180,00" e acumulado "820,00"', () => {
      const day = flow.days.find((item) => item.date === '2026-03-14');
      w.expectCents(day?.netCents ?? NaN, '-180,00');
      w.expectCents(day?.cumulativeCents ?? NaN, '820,00');
    });
  });

  Scenario('Cancelar despesa exige motivo', ({ Given, When, Then }) => {
    Given(
      '"carla" lançou a despesa "Gás" de "180,00" em "Contas de consumo" paga em "2026-03-14"',
      () =>
        w.entry('carla', {
          type: 'DESPESA',
          description: 'Gás',
          amount: '180,00',
          category: 'Contas de consumo',
          status: 'PAGO',
          date: '2026-03-14',
        }),
    );
    When('"carla" tenta cancelar a despesa "Gás" pelo motivo ""', () =>
      w.attempt(() => w.cancelEntry('carla', 'Gás', '')),
    );
    Then('a ação é recusada com o código "CANCEL_REASON_REQUIRED"', () => {
      w.expectFailure('CANCEL_REASON_REQUIRED');
    });
    When('"carla" cancela a despesa "Gás" pelo motivo "lançado em dobro"', () =>
      w.cancelEntry('carla', 'Gás', 'lançado em dobro'),
    );
    Then('o fluxo de caixa de "2026-03-14" tem entradas "0,00" e saídas "0,00"', async () => {
      const day = await w.flowOf('2026-03-14');
      w.expectCents(day.inflowCents, '0,00');
      w.expectCents(day.outflowCents, '0,00');
    });
  });

  Scenario('Categoria nova e categoria repetida', ({ When, Then }) => {
    When('"carla" cria a categoria de despesa "Marketing"', async () => {
      await w.services.finance.createCategory(w.ctx('carla'), {
        type: 'DESPESA',
        name: 'Marketing',
      });
    });
    Then('a categoria "Marketing" pode ser usada em despesas', async () => {
      await w.entry('carla', {
        type: 'DESPESA',
        description: 'Panfletos',
        amount: '90,00',
        category: 'Marketing',
        status: 'PAGO',
        date: '2026-03-14',
      });
      const day = await w.flowOf('2026-03-14');
      w.expectCents(day.outflowCents, '90,00');
    });
    When('"carla" tenta criar a categoria de despesa "marketing"', () =>
      w.attempt(() =>
        w.services.finance.createCategory(w.ctx('carla'), { type: 'DESPESA', name: 'marketing' }),
      ),
    );
    Then('a ação é recusada com o código "FINANCE_CATEGORY_TAKEN"', () => {
      w.expectFailure('FINANCE_CATEGORY_TAKEN');
    });
  });

  Scenario('O caixa não vê o financeiro', ({ When, Then }) => {
    When('"bia" tenta ver os lançamentos do financeiro', () =>
      w.attempt(() => w.services.finance.entries(w.ctx('bia'), w.MONTH)),
    );
    Then('a ação é recusada com o código "FORBIDDEN"', () => {
      w.expectFailure('FORBIDDEN');
    });
  });
});
