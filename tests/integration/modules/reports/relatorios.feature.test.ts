import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import type { CashReportSession, ProductSales, SalesReport, StockReport } from '@/modules/reports';
import { useTestDatabase } from '../../../support/database';
import { cents } from '../pos/pos-world';
import { reportsWorld } from './reports-world';

const feature = await loadFeature('tests/features/reports/relatorios.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = reportsWorld(db);

  Background(({ Given, And }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.first('carla', 'GERENTE'));
    And('"bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"', () =>
      w.withTerminal('bia', 'CAIXA', 'CX01'),
    );
    And('"joão" é garçom na loja "Centro"', () => w.person('joão', 'GARCOM'));
    And('a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"', () =>
      w.sells('X-Burger', '32,00', { modifier: ['Bacon', '5,00'] }),
    );
    And('o "X-Burger" usa "150" "g" de "Carne moída"', () =>
      w.recipe('PRODUCT', 'X-Burger', '150', 'Carne moída'),
    );
    And('o "Centro" tem "1" "kg" de "Carne moída"', () => w.stockOf('Carne moída', '1'));
    And('existe a mesa "10" no "Centro"', () => w.createTable('10'));
    And('"bia" abriu o caixa com "0,00" de fundo de troco', () => w.openCash('bia', '0,00'));
  });

  Scenario('Venda conta no dia operacional do fechamento', ({ Given, And, When, Then }) => {
    let report: SalesReport;
    Given('"joão" enviou 1 "X-Burger" para a mesa "10"', () =>
      w.sendTo('joão', '10', [{ quantity: 1, product: 'X-Burger' }]),
    );
    And('"bia" fechou o caixa informando "0,00" em dinheiro', () =>
      w.closeCash('bia', { DINHEIRO: '0,00' }),
    );
    And('o relógio passa para "2026-03-15" às "06:00"', () => {
      w.setClock('2026-03-15', '06:00');
    });
    And('"bia" abriu o caixa com "0,00" de fundo de troco', () => w.openCash('bia', '0,00'));
    And('"bia" recebeu tudo no PIX da mesa "10"', () => w.payAll('bia', { table: '10' }, 'PIX'));
    When('"carla" vê o relatório de vendas de "2026-03-14" a "2026-03-15"', async () => {
      report = await w.sales('carla', '2026-03-14', '2026-03-15');
    });
    Then('o dia "2026-03-14" tem 0 contas e o dia "2026-03-15" tem 1 conta de "35,20"', () => {
      expect(report.days.find((day) => day.date === '2026-03-14')).toBeUndefined();
      const day = report.days.find((item) => item.date === '2026-03-15');
      expect(day?.orders).toBe(1);
      w.expectCents(day?.totalCents ?? NaN, '35,20');
    });
  });

  Scenario('Vendas por produto com custo e margem', ({ Given, And, When, Then }) => {
    let report: ProductSales;
    Given('"joão" enviou 2 "X-Burger" para a mesa "10"', () =>
      w.sendTo('joão', '10', [{ quantity: 2, product: 'X-Burger' }]),
    );
    And('"bia" recebeu tudo no PIX da mesa "10"', () => w.payAll('bia', { table: '10' }, 'PIX'));
    When('"carla" vê as vendas por produto de hoje', async () => {
      report = await w.services.reports.salesByProduct(w.ctx('carla'), {});
    });
    Then('"X-Burger" tem 2 unidades, valor "64,00", custo "12,00" e margem "52,00"', () => {
      expect(report.rows).toEqual([
        expect.objectContaining({
          name: 'X-Burger',
          quantity: 2,
          grossCents: cents('64,00'),
          discountsCents: 0,
          costCents: cents('12,00'),
          marginCents: cents('52,00'),
        }),
      ]);
    });
  });

  Scenario('Vendas por forma de pagamento', ({ Given, And, When, Then }) => {
    let report: SalesReport;
    Given('"joão" enviou 2 "X-Burger" para a mesa "10"', () =>
      w.sendTo('joão', '10', [{ quantity: 2, product: 'X-Burger' }]),
    );
    And('"bia" recebeu "50,00" no PIX da mesa "10"', () =>
      w.pay('bia', { table: '10' }, 'PIX', '50,00'),
    );
    And('"bia" recebeu o restante em dinheiro da mesa "10"', () =>
      w.payAll('bia', { table: '10' }, 'DINHEIRO'),
    );
    When('"carla" vê o relatório de vendas de hoje', async () => {
      report = await w.sales('carla');
    });
    Then('as formas de pagamento são "PIX" "50,00" e "DINHEIRO" "20,40"', () => {
      expect(
        Object.fromEntries(report.methods.map((line) => [line.method, line.amountCents])),
      ).toEqual({ PIX: cents('50,00'), DINHEIRO: cents('20,40') });
    });
  });

  Scenario('Relatório de caixa com a diferença do fechamento', ({ Given, And, When, Then }) => {
    let sessions: CashReportSession[];
    Given('"bia" recebeu "45,50" em dinheiro e "30,00" no PIX de uma conta de balcão', async () => {
      await w.counterWith('bia', 'Rafa', '75,50');
      await w.pay('bia', { counter: 'Rafa' }, 'DINHEIRO', '45,50');
      await w.pay('bia', { counter: 'Rafa' }, 'PIX', '30,00');
    });
    And('"bia" fechou o caixa informando "40,00" em dinheiro', () =>
      w.closeCash('bia', { DINHEIRO: '40,00' }),
    );
    When('"carla" vê o relatório de caixa de hoje', async () => {
      ({ sessions } = await w.services.reports.cash(w.ctx('carla'), {}));
    });
    Then('o caixa "CX01" tem diferença em dinheiro "-5,50"', () => {
      const session = sessions.find((item) => item.terminalCode === 'CX01');
      const cash = session?.counts?.find((line) => line.method === 'DINHEIRO');
      w.expectCents(cash?.differenceCents ?? NaN, '-5,50');
    });
  });

  Scenario('Estoque: CMV do período e insumo abaixo do mínimo', ({ Given, And, When, Then }) => {
    let report: StockReport;
    Given('o mínimo de "Carne moída" no "Centro" é "900" "g"', () =>
      w.setMinimum('Carne moída', '900'),
    );
    And('"joão" enviou 1 "X-Burger" para a mesa "10"', () =>
      w.sendTo('joão', '10', [{ quantity: 1, product: 'X-Burger' }]),
    );
    When('"carla" vê o relatório de estoque de hoje', async () => {
      report = await w.services.reports.stock(w.ctx('carla'), {});
    });
    Then('o CMV do período é "6,00"', () => {
      w.expectCents(report.cogsCents, '6,00');
    });
    And('"Carne moída" aparece abaixo do mínimo', () => {
      expect(report.balances.find((row) => row.name === 'Carne moída')?.belowMinimum).toBe(true);
    });
  });
});
