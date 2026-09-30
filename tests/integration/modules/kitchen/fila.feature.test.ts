import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { kitchenWorld } from './kitchen-world';

const feature = await loadFeature('tests/features/kitchen/fila.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = kitchenWorld(db);

  Background(({ Given, And }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.first('carla', 'GERENTE'));
    And('"joão" é garçom na loja "Centro"', () => w.person('joão', 'GARCOM'));
    And('"rita" é da cozinha na loja "Centro"', () => w.person('rita', 'COZINHA'));
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
  });

  Scenario(
    'Pedidos aparecem na ordem de envio, sem os itens sem preparo',
    ({ Given, And, When, Then }) => {
      Given(
        '"joão" enviou 1 "X-Burger" com "Bacon" e a observação "sem cebola" para a mesa "11"',
        () =>
          w.sendTo('joão', '11', [
            { quantity: 1, product: 'X-Burger', modifier: 'Bacon', notes: 'sem cebola' },
          ]),
      );
      And('"joão" enviou 2 "X-Burger" e 1 "Refrigerante lata" para a mesa "10"', async () => {
        // Um minuto depois: a fila é pela hora do envio
        w.services.clock.advanceMinutes(1);
        await w.sendTo('joão', '10', [
          { quantity: 2, product: 'X-Burger' },
          { quantity: 1, product: 'Refrigerante lata' },
        ]);
      });
      When('"rita" abre a tela da cozinha', () => w.openBoard('rita'));
      Then('a fila mostra "Mesa 11" e depois "Mesa 10"', () => {
        w.expectQueue(['Mesa 11', 'Mesa 10']);
      });
      And(
        'o pedido da "Mesa 11" mostra "1 × X-Burger" com "Bacon" e a observação "sem cebola"',
        () => {
          const [item] = w.ticketIn(w.board.queue, 'Mesa 11').items;
          expect(item).toMatchObject({
            quantity: 1,
            productName: 'X-Burger',
            notes: 'sem cebola',
            modifiers: [expect.objectContaining({ name: 'Bacon' })],
          });
        },
      );
      And('o pedido da "Mesa 10" mostra só "2 × X-Burger"', () => {
        const ticket = w.ticketIn(w.board.queue, 'Mesa 10');
        expect(ticket.items.map((item) => [item.quantity, item.productName])).toEqual([
          [2, 'X-Burger'],
        ]);
      });
      And('o pedido da "Mesa 10" foi enviado por "joão" na rodada 1', () => {
        expect(w.ticketIn(w.board.queue, 'Mesa 10')).toMatchObject({
          roundNumber: 1,
          sentBy: w.userId('joão'),
          status: 'NOVO',
        });
      });
    },
  );

  Scenario('Pedido de balcão aparece com o nome do cliente', ({ Given, When, Then }) => {
    Given('"joão" enviou 1 "X-Burger" para o balcão "Ana"', () =>
      w.sendToCounter('joão', 'Ana', 1, 'X-Burger'),
    );
    When('"rita" abre a tela da cozinha', () => w.openBoard('rita'));
    Then('a fila mostra "Balcão · Ana"', () => {
      w.expectQueue(['Balcão · Ana']);
    });
  });

  Scenario('Os tempos de alerta vêm da loja', ({ Given, When, Then }) => {
    Given('o ADMIN configurou os alertas da cozinha do "Centro" para 8 e 15 minutos', () =>
      w.setAlerts(8, 15),
    );
    When('"rita" abre a tela da cozinha', () => w.openBoard('rita'));
    Then('a tela usa "Atenção" a partir de 8 minutos e "Atrasado" a partir de 15', () => {
      expect(w.board).toMatchObject({ warningMinutes: 8, lateMinutes: 15 });
      expect(w.board.serverNow).toEqual(w.services.clock.now());
    });
  });

  Scenario('Garçom acompanha, mas não marca', ({ Given, When, Then }) => {
    Given('"joão" enviou 1 "X-Burger" para a mesa "10"', () =>
      w.sendTo('joão', '10', [{ quantity: 1, product: 'X-Burger' }]),
    );
    When('"joão" abre a tela da cozinha', () => w.openBoard('joão'));
    Then('a fila mostra "Mesa 10"', () => {
      w.expectQueue(['Mesa 10']);
    });
    When('"joão" tenta marcar pronto o primeiro item da mesa "10"', () =>
      w.attempt(() => w.ready('joão', '10', 0)),
    );
    Then('a ação é recusada com o código "FORBIDDEN"', () => {
      w.expectFailure('FORBIDDEN');
    });
  });

  Scenario('Pedido de outra loja não aparece', ({ Given, And, When, Then }) => {
    Given('"paula" é da cozinha na loja "Praia"', () => w.personAt('paula', 'COZINHA', 'Praia'));
    And('"joão" enviou 1 "X-Burger" para a mesa "10"', () =>
      w.sendTo('joão', '10', [{ quantity: 1, product: 'X-Burger' }]),
    );
    When('"paula" abre a tela da cozinha', () => w.openBoard('paula'));
    Then('a fila está vazia', () => {
      expect(w.board.queue).toEqual([]);
    });
    When('"paula" tenta marcar pronto o primeiro item da mesa "10"', () =>
      w.attempt(() => w.ready('paula', '10', 0)),
    );
    Then('a ação é recusada com o código "ORDER_ITEM_NOT_FOUND"', () => {
      w.expectFailure('ORDER_ITEM_NOT_FOUND');
    });
  });
});
