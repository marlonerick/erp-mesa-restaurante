import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { floorWorld } from './floor-world';

const feature = await loadFeature('tests/features/orders/mesas-e-contas.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = floorWorld(db);
  const at = (table: string) => ({ table });

  Background(({ Given, And }) => {
    Given('que "joão" é garçom na loja "Centro"', () => w.first('joão', 'GARCOM'));
    And('a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"', () =>
      w.sells('X-Burger', '32,00', { modifier: ['Bacon', '5,00'] }),
    );
    And('existem as mesas "10", "11" e "12" no "Centro"', async () => {
      for (const number of ['10', '11', '12']) await w.createTable(number);
    });
    And('"joão" abriu a mesa "10"', () => w.open('joão', '10'));
    And('"joão" lançou 1 "X-Burger" na mesa "10"', () => w.add('joão', at('10'), 1, 'X-Burger'));
    And('"joão" enviou a rodada da mesa "10"', () => w.send('joão', '10'));
  });

  const status = (table: string, expected: string) => async () => {
    expect(await w.floorStatus(table)).toBe(expected);
  };
  const requestBill = async (table: string) => {
    await w.services.orders.requestBill(w.ctx('joão'), {
      orderId: await w.orderOfTable(table),
      version: await w.version(table),
    });
  };
  const cancelOrder = async (table: string) => {
    await w.services.orders.cancelOrder(w.ctx('joão'), {
      orderId: await w.orderOfTable(table),
      version: await w.version(table),
    });
  };

  Scenario('Pedir a conta', ({ When, Then }) => {
    When('"joão" pede a conta da mesa "10"', () => requestBill('10'));
    Then(
      'o mapa do "Centro" mostra a mesa "10" como "AGUARDANDO_CONTA"',
      status('10', 'AGUARDANDO_CONTA'),
    );
  });

  Scenario('Cliente pede mais depois de pedir a conta', ({ Given, When, Then, And }) => {
    Given('"joão" pediu a conta da mesa "10"', () => requestBill('10'));
    When('"joão" lança 1 "X-Burger" na mesa "10"', () => w.add('joão', at('10'), 1, 'X-Burger'));
    Then('o mapa do "Centro" mostra a mesa "10" como "OCUPADA"', status('10', 'OCUPADA'));
    And('a auditoria registra "TABLE_STATUS_CHANGED" feito por "joão"', () =>
      w.expectAudit('TABLE_STATUS_CHANGED', 'joão'),
    );
  });

  Scenario('Não pede a conta com item pendente', ({ Given, When, Then }) => {
    Given('"joão" lançou 1 "X-Burger" na mesa "10"', () => w.add('joão', at('10'), 1, 'X-Burger'));
    When('"joão" tenta pedir a conta da mesa "10"', () => w.attempt(() => requestBill('10')));
    Then('a ação é recusada com o código "PENDING_ITEMS"', () => {
      w.expectFailure('PENDING_ITEMS');
    });
  });

  Scenario('Transferir a conta para outra mesa', ({ When, Then, And }) => {
    When('"joão" transfere a mesa "10" para a mesa "11"', async () =>
      w.services.orders.transfer(w.ctx('joão'), {
        orderId: await w.orderOfTable('10'),
        version: await w.version('10'),
        fromTableId: w.table('10'),
        toTableId: w.table('11'),
      }),
    );
    Then('o mapa do "Centro" mostra a mesa "10" como "LIVRE"', status('10', 'LIVRE'));
    And('o mapa do "Centro" mostra a mesa "11" como "OCUPADA"', status('11', 'OCUPADA'));
    And('o subtotal da conta da mesa "11" é "32,00"', async () => {
      const detail = await w.order('11');
      expect(detail.subtotalCents).toBe(3200);
      expect(detail.label).toBe('11');
    });
    And('a auditoria registra "TABLE_TRANSFERRED" feito por "joão"', () =>
      w.expectAudit('TABLE_TRANSFERRED', 'joão'),
    );
  });

  Scenario('Juntar uma mesa livre', ({ When, Then, And }) => {
    When('"joão" junta a mesa "11" na conta da mesa "10"', () => w.join('joão', '11', '10'));
    Then('a mesa "11" está na mesma conta da mesa "10"', async () => {
      expect(await w.orderOfTable('11')).toBe(await w.orderOfTable('10'));
      expect((await w.order('10')).label).toBe('10 + 11');
    });
    And('o mapa do "Centro" mostra a mesa "11" como "OCUPADA"', status('11', 'OCUPADA'));
  });

  Scenario('Juntar duas contas abertas', ({ Given, And, When, Then }) => {
    Given('"joão" abriu a mesa "12"', () => w.open('joão', '12'));
    And('"joão" lançou 2 "X-Burger" na mesa "12"', () => w.add('joão', at('12'), 2, 'X-Burger'));
    And('"joão" enviou a rodada da mesa "12"', () => w.send('joão', '12'));
    When('"joão" junta a mesa "12" na conta da mesa "10"', () => w.join('joão', '12', '10'));
    Then('a mesa "12" está na mesma conta da mesa "10"', async () => {
      expect(await w.orderOfTable('12')).toBe(await w.orderOfTable('10'));
    });
    And('o subtotal da conta da mesa "10" é "96,00"', async () => {
      expect((await w.order('10')).subtotalCents).toBe(9600);
    });
    And('a mesa "10" tem 2 rodadas', async () => {
      const detail = await w.order('10');
      expect(detail.rounds.map((round) => round.number)).toEqual([2, 1]);
    });
    And('a conta antiga da mesa "12" foi encerrada como mesclada', async () => {
      const old = await w.orderRow(w.previousOrder('12'));
      expect(old).toMatchObject({
        status: 'CANCELADO',
        cancelReason: 'MESCLADA',
        mergedIntoOrderId: await w.orderOfTable('10'),
      });
    });
    And('a auditoria registra "ORDERS_MERGED" feito por "joão"', () =>
      w.expectAudit('ORDERS_MERGED', 'joão'),
    );
  });

  Scenario('Separar uma mesa juntada por engano', ({ Given, When, Then, And }) => {
    Given('"joão" juntou a mesa "11" na conta da mesa "10"', () => w.join('joão', '11', '10'));
    When('"joão" separa a mesa "11" da conta', async () =>
      w.services.orders.detach(w.ctx('joão'), {
        orderId: await w.orderOfTable('10'),
        version: await w.version('10'),
        tableId: w.table('11'),
      }),
    );
    Then('o mapa do "Centro" mostra a mesa "11" como "LIVRE"', status('11', 'LIVRE'));
    And('o mapa do "Centro" mostra a mesa "10" como "OCUPADA"', status('10', 'OCUPADA'));
  });

  Scenario(
    'Conta aberta por engano é cancelada se nada foi enviado',
    ({ Given, And, When, Then }) => {
      Given('"joão" abriu a mesa "11"', () => w.open('joão', '11'));
      And('"joão" lançou 1 "X-Burger" na mesa "11"', () => w.add('joão', at('11'), 1, 'X-Burger'));
      When('"joão" cancela a conta da mesa "11"', () => cancelOrder('11'));
      Then('o mapa do "Centro" mostra a mesa "11" como "LIVRE"', status('11', 'LIVRE'));
      And('a auditoria registra "ORDER_CANCELLED" feito por "joão"', () =>
        w.expectAudit('ORDER_CANCELLED', 'joão'),
      );
    },
  );

  Scenario('Conta com item enviado não é cancelada', ({ When, Then }) => {
    When('"joão" tenta cancelar a conta da mesa "10"', () => w.attempt(() => cancelOrder('10')));
    Then('a ação é recusada com o código "ORDER_HAS_SENT_ITEMS"', () => {
      w.expectFailure('ORDER_HAS_SENT_ITEMS');
    });
  });

  // Achado B-1 da revisão: várias mesas mudando de estado juntas
  Scenario('Pedir a conta de mesas juntadas muda todas elas', ({ Given, When, Then, And }) => {
    Given('"joão" juntou a mesa "11" na conta da mesa "10"', () => w.join('joão', '11', '10'));
    When('"joão" pede a conta da mesa "10"', () => requestBill('10'));
    Then(
      'o mapa do "Centro" mostra a mesa "10" como "AGUARDANDO_CONTA"',
      status('10', 'AGUARDANDO_CONTA'),
    );
    And(
      'o mapa do "Centro" mostra a mesa "11" como "AGUARDANDO_CONTA"',
      status('11', 'AGUARDANDO_CONTA'),
    );
  });

  Scenario(
    'Cliente de mesas juntadas pede mais depois de pedir a conta',
    ({ Given, And, When, Then }) => {
      Given('"joão" juntou a mesa "11" na conta da mesa "10"', () => w.join('joão', '11', '10'));
      And('"joão" pediu a conta da mesa "10"', () => requestBill('10'));
      When('"joão" lança 1 "X-Burger" na mesa "11"', () => w.add('joão', at('11'), 1, 'X-Burger'));
      Then('o mapa do "Centro" mostra a mesa "10" como "OCUPADA"', status('10', 'OCUPADA'));
      And('o mapa do "Centro" mostra a mesa "11" como "OCUPADA"', status('11', 'OCUPADA'));
    },
  );

  Scenario('Juntar uma conta que já tem duas mesas', ({ Given, And, When, Then }) => {
    Given('"joão" abriu a mesa "12"', () => w.open('joão', '12'));
    And('"joão" juntou a mesa "11" na conta da mesa "12"', () => w.join('joão', '11', '12'));
    When('"joão" junta a mesa "12" na conta da mesa "10"', () => w.join('joão', '12', '10'));
    Then('a mesa "11" está na mesma conta da mesa "10"', async () => {
      expect(await w.orderOfTable('11')).toBe(await w.orderOfTable('10'));
    });
    And('a mesa "12" está na mesma conta da mesa "10"', async () => {
      expect(await w.orderOfTable('12')).toBe(await w.orderOfTable('10'));
    });
    And('o rótulo da conta da mesa "10" é "10 + 11 + 12"', async () => {
      expect((await w.order('10')).label).toBe('10 + 11 + 12');
    });
  });
});
