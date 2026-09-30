import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { kitchenWorld } from './kitchen-world';

const feature = await loadFeature('tests/features/kitchen/preparo.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = kitchenWorld(db);

  const itemIs = (position: number, status: string) => async () => {
    expect((await w.sentItem('10', position)).status).toBe(status);
  };
  const ticketIs = (status: string) => async () => {
    const { queue } = await w.refresh();
    expect(w.ticketIn(queue, 'Mesa 10').status).toBe(status);
  };
  const queueIsEmpty = async () => {
    expect((await w.refresh()).queue).toEqual([]);
  };
  const inRecent = async () => {
    const { recent } = await w.refresh();
    expect(w.ticketIn(recent, 'Mesa 10').status).toBe('PRONTO');
  };

  Background(({ Given, And }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.first('carla', 'GERENTE'));
    And('"joão" é garçom na loja "Centro"', () => w.person('joão', 'GARCOM'));
    And('"rita" é da cozinha na loja "Centro"', () => w.person('rita', 'COZINHA'));
    And('a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"', () =>
      w.sells('X-Burger', '32,00', { modifier: ['Bacon', '5,00'] }),
    );
    And('a loja "Centro" vende "Batata frita" por "18,00"', () => w.sells('Batata frita', '18,00'));
    And('existe a mesa "10" no "Centro"', () => w.createTable('10'));
    And('"joão" enviou 1 "X-Burger" e 1 "Batata frita" para a mesa "10"', () =>
      w.sendTo('joão', '10', [
        { quantity: 1, product: 'X-Burger' },
        { quantity: 1, product: 'Batata frita' },
      ]),
    );
  });

  Scenario('Iniciar e terminar um item', ({ When, Then, And }) => {
    When('"rita" inicia o primeiro item da mesa "10"', () => w.start('rita', '10', 0));
    Then('o primeiro item da mesa "10" está "EM_PREPARO"', itemIs(0, 'EM_PREPARO'));
    And('o pedido da "Mesa 10" está "EM_PREPARO" na fila', ticketIs('EM_PREPARO'));
    When('"rita" marca pronto o primeiro item da mesa "10"', () => w.ready('rita', '10', 0));
    Then('o primeiro item da mesa "10" está "PRONTO"', itemIs(0, 'PRONTO'));
    And('o primeiro item da mesa "10" foi terminado por "rita"', async () => {
      expect(await w.readyBy('10', 0)).toBe(w.userId('rita'));
    });
    And('o salão mostra 1 item pronto na mesa "10"', async () => {
      const { tables } = await w.services.orders.floor(w.ctx('joão'));
      const table = tables.find((row) => row.id === w.table('10'));
      expect(table?.order?.readyCount).toBe(1);
    });
    And('o pedido da "Mesa 10" continua na fila', ticketIs('EM_PREPARO'));
  });

  Scenario('Pronto sem ter iniciado', ({ When, Then, And }) => {
    When('"rita" marca pronto o segundo item da mesa "10"', () => w.ready('rita', '10', 1));
    Then('o segundo item da mesa "10" está "PRONTO"', itemIs(1, 'PRONTO'));
    And('o pedido da "Mesa 10" está "EM_PREPARO" na fila', ticketIs('EM_PREPARO'));
  });

  Scenario('Tudo pronto tira o pedido da fila', ({ When, Then, And }) => {
    When('"rita" marca tudo pronto no pedido da "Mesa 10"', () => w.readyAll('rita', 'Mesa 10'));
    Then('os itens enviados da mesa "10" estão "PRONTO"', async () => {
      expect(w.lastChanged).toBe(2);
      expect((await w.sentItems('10')).map((item) => item.status)).toEqual(['PRONTO', 'PRONTO']);
    });
    And('a fila está vazia', queueIsEmpty);
    And('"Mesa 10" aparece nos prontos há pouco', inRecent);
  });

  Scenario('Marcar de novo não muda nada', ({ Given, When, Then, And }) => {
    Given('"rita" marcou pronto o primeiro item da mesa "10"', () => w.ready('rita', '10', 0));
    When('"carla" marca pronto o primeiro item da mesa "10"', () => w.ready('carla', '10', 0));
    Then('nada mudou', () => {
      expect(w.lastChanged).toBe(false);
    });
    And('o primeiro item da mesa "10" foi terminado por "rita"', async () => {
      expect(await w.readyBy('10', 0)).toBe(w.userId('rita'));
    });
  });

  Scenario('Desfazer um pronto marcado por engano', ({ Given, When, Then, And }) => {
    Given('"rita" marcou tudo pronto no pedido da "Mesa 10"', () => w.readyAll('rita', 'Mesa 10'));
    When('"rita" desfaz o pronto do primeiro item da mesa "10"', () => w.undo('rita', '10', 0));
    Then('o primeiro item da mesa "10" está "EM_PREPARO"', itemIs(0, 'EM_PREPARO'));
    And('o pedido da "Mesa 10" está "EM_PREPARO" na fila', ticketIs('EM_PREPARO'));
    And('a auditoria registra "KITCHEN_READY_UNDONE" feito por "rita"', () =>
      w.expectAudit('KITCHEN_READY_UNDONE', 'rita'),
    );
  });

  Scenario('Depois de entregue, não dá para desfazer', ({ Given, And, When, Then }) => {
    Given('"rita" marcou pronto o primeiro item da mesa "10"', () => w.ready('rita', '10', 0));
    And('"joão" entregou o primeiro item da mesa "10"', () => w.deliver('joão', '10', 0));
    When('"rita" tenta desfazer o pronto do primeiro item da mesa "10"', () =>
      w.attempt(() => w.undo('rita', '10', 0)),
    );
    Then('a ação é recusada com o código "ITEM_ALREADY_DELIVERED"', () => {
      w.expectFailure('ITEM_ALREADY_DELIVERED');
    });
  });

  Scenario('Item cancelado pelo salão não é marcado', ({ Given, When, Then, And }) => {
    Given('"carla" cancelou o primeiro item da mesa "10" pelo motivo "cliente desistiu"', () =>
      w.cancel('carla', '10', 0, 'cliente desistiu'),
    );
    When('"rita" tenta marcar pronto o primeiro item da mesa "10"', () =>
      w.attempt(() => w.ready('rita', '10', 0)),
    );
    Then('a ação é recusada com o código "ITEM_CANCELLED"', () => {
      w.expectFailure('ITEM_CANCELLED');
    });
    And(
      'o pedido da "Mesa 10" mostra o primeiro item cancelado pelo motivo "cliente desistiu"',
      async () => {
        const { queue } = await w.refresh();
        expect(w.ticketIn(queue, 'Mesa 10').items[0]).toMatchObject({
          productName: 'X-Burger',
          status: 'CANCELADO',
          cancelReason: 'cliente desistiu',
        });
      },
    );
  });

  Scenario(
    'Cancelar o único item que faltava deixa o pedido pronto',
    ({ Given, When, Then, And }) => {
      Given('"rita" marcou pronto o segundo item da mesa "10"', () => w.ready('rita', '10', 1));
      When('"carla" cancela o primeiro item da mesa "10" pelo motivo "cliente desistiu"', () =>
        w.cancel('carla', '10', 0, 'cliente desistiu'),
      );
      Then('a fila está vazia', queueIsEmpty);
      And('"Mesa 10" aparece nos prontos há pouco', inRecent);
    },
  );

  Scenario('Pedido todo cancelado sai da fila riscado', ({ When, Then, And }) => {
    When(
      '"carla" cancela todos os itens da mesa "10" pelo motivo "cliente foi embora"',
      async () => {
        await w.cancel('carla', '10', 0, 'cliente foi embora');
        await w.cancel('carla', '10', 1, 'cliente foi embora');
      },
    );
    Then('a fila está vazia', queueIsEmpty);
    And('o pedido da "Mesa 10" aparece riscado como cancelado', () => {
      expect(w.ticketIn(w.board.cancelled, 'Mesa 10').status).toBe('CANCELADO');
    });
  });
});
