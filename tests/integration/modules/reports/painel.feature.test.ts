import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import type { Dashboard } from '@/modules/reports';
import { useTestDatabase } from '../../../support/database';
import { reportsWorld } from './reports-world';

const feature = await loadFeature('tests/features/reports/painel.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = reportsWorld(db);
  let panel: Dashboard;

  Background(({ Given, And }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.first('carla', 'GERENTE'));
    And('"bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"', () =>
      w.withTerminal('bia', 'CAIXA', 'CX01'),
    );
    And('"joão" é garçom na loja "Centro"', () => w.person('joão', 'GARCOM'));
    And('a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"', () =>
      w.sells('X-Burger', '32,00', { modifier: ['Bacon', '5,00'] }),
    );
    And('a loja "Centro" vende "Refrigerante lata" por "7,00" sem preparo', () =>
      w.sells('Refrigerante lata', '7,00', { noPrep: true }),
    );
    And('existem as mesas "10" e "11" no "Centro"', async () => {
      await w.createTable('10');
      await w.createTable('11');
    });
    And('"bia" abriu o caixa com "100,00" de fundo de troco', () => w.openCash('bia', '100,00'));
  });

  Scenario('Vendas do dia, ticket médio e mais vendidos', ({ Given, And, When, Then }) => {
    Given('"joão" enviou 2 "X-Burger" e 1 "Refrigerante lata" para a mesa "10"', () =>
      w.sendTo('joão', '10', [
        { quantity: 2, product: 'X-Burger' },
        { quantity: 1, product: 'Refrigerante lata' },
      ]),
    );
    And('"bia" recebeu tudo no PIX da mesa "10"', () => w.payAll('bia', { table: '10' }, 'PIX'));
    And('"joão" enviou 1 "X-Burger" para o balcão "Ana"', () =>
      w.sendToCounter('joão', 'Ana', 1, 'X-Burger'),
    );
    And('"bia" recebeu tudo em dinheiro do balcão "Ana"', () =>
      w.payAll('bia', { counter: 'Ana' }, 'DINHEIRO'),
    );
    When('"carla" abre o painel', async () => {
      panel = await w.dashboard('carla');
    });
    Then('o painel mostra vendas "110,10", 2 contas fechadas e ticket médio "55,05"', () => {
      w.expectCents(panel.salesCents, '110,10');
      expect(panel.closedOrders).toBe(2);
      w.expectCents(panel.averageTicketCents, '55,05');
    });
    And('o mais vendido é "X-Burger" com 3 unidades', () => {
      expect(panel.topProducts[0]).toEqual({ name: 'X-Burger', quantity: 3 });
    });
  });

  Scenario('Mesas, cozinha e itens atrasados', ({ Given, And, When, Then }) => {
    Given('"joão" enviou 1 "X-Burger" para a mesa "11"', () =>
      w.sendTo('joão', '11', [{ quantity: 1, product: 'X-Burger' }]),
    );
    And('passaram 21 minutos', () => {
      w.services.clock.advanceMinutes(21);
    });
    When('"carla" abre o painel', async () => {
      panel = await w.dashboard('carla');
    });
    Then('o painel mostra 1 mesa ocupada, 1 item na cozinha e 1 item atrasado', () => {
      expect(panel).toMatchObject({ occupiedTables: 1, kitchenItems: 1, lateItems: 1 });
    });
    And('o painel mostra 1 caixa aberto sem o valor esperado', () => {
      expect(panel.openCash).toHaveLength(1);
      // Fechamento cego (RN-CASH-06): nada de esperado, vendas ou contagem do caixa aberto
      expect(Object.keys(panel.openCash[0] ?? {}).sort()).toEqual([
        'openedAt',
        'openedByName',
        'terminalCode',
        'terminalName',
      ]);
    });
  });

  Scenario('O caixa vê o painel, mas não os relatórios', ({ When, Then }) => {
    When('"bia" abre o painel', async () => {
      await w.attempt(async () => {
        panel = await w.dashboard('bia');
      });
    });
    Then('o painel abre', () => {
      expect(w.failure).toBeNull();
      expect(panel.today).toBe('2026-03-14');
    });
    When('"bia" tenta abrir o relatório de vendas', () => w.attempt(() => w.sales('bia')));
    Then('a ação é recusada com o código "FORBIDDEN"', () => {
      w.expectFailure('FORBIDDEN');
    });
  });

  Scenario('O garçom não vê o painel', ({ When, Then }) => {
    When('"joão" tenta abrir o painel', () => w.attempt(() => w.dashboard('joão')));
    Then('a ação é recusada com o código "FORBIDDEN"', () => {
      w.expectFailure('FORBIDDEN');
    });
  });
});
