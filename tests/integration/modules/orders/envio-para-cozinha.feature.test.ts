import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { floorWorld } from './floor-world';

const feature = await loadFeature('tests/features/orders/envio-para-cozinha.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = floorWorld(db);
  const mesa10 = { table: '10' };

  Background(({ Given, And }) => {
    Given('que "joão" é garçom na loja "Centro"', () => w.first('joão', 'GARCOM'));
    And('a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"', () =>
      w.sells('X-Burger', '32,00', { modifier: ['Bacon', '5,00'] }),
    );
    And(
      'o "X-Burger" usa "150" "g" de "Carne moída" e o "Bacon" usa "30" "g" de "Bacon fatiado"',
      async () => {
        await w.recipe('PRODUCT', 'X-Burger', '150', 'Carne moída');
        await w.recipe('MODIFIER', 'Bacon', '30', 'Bacon fatiado');
      },
    );
    And('o "Centro" tem "1" "kg" de "Carne moída" e "1" "kg" de "Bacon fatiado"', async () => {
      await w.stockOf('Carne moída', '1');
      await w.stockOf('Bacon fatiado', '1');
    });
    And('a loja "Centro" vende "Refrigerante lata" por "7,00" sem preparo', () =>
      w.sells('Refrigerante lata', '7,00', { noPrep: true }),
    );
    And('existe a mesa "10" no "Centro"', () => w.createTable('10'));
    And('"joão" abriu a mesa "10"', () => w.open('joão', '10'));
  });

  const roundWith = (status: string) => async () => {
    const detail = await w.order('10');
    expect(detail.rounds).toHaveLength(1);
    expect(detail.rounds[0]?.number).toBe(1);
    expect(detail.rounds[0]?.items.map((item) => item.status)).toEqual([status]);
    expect(detail.pending).toHaveLength(0);
  };
  const rounds = (count: number) => async () => {
    expect((await w.order('10')).rounds).toHaveLength(count);
  };

  Scenario(
    'Enviar a rodada manda o lanche para a cozinha e baixa o estoque',
    ({ Given, When, Then, And }) => {
      Given('"joão" lançou 2 "X-Burger" com "Bacon" na mesa "10"', () =>
        w.add('joão', mesa10, 2, 'X-Burger', { modifier: 'Bacon' }),
      );
      When('"joão" envia a rodada da mesa "10"', () => w.send('joão', '10'));
      Then('a mesa "10" tem a rodada 1 com 1 item "ENVIADO"', roundWith('ENVIADO'));
      And('a cozinha do "Centro" recebeu 1 ticket novo', async () => {
        expect(await w.newTickets()).toBe(1);
        expect(w.lastSend).toMatchObject({ roundNumber: 1, sent: 1, ready: 0, warnings: [] });
      });
      And('o saldo de "Carne moída" no "Centro" é "700.000"', () =>
        w.expectBalance('Carne moída', '700.000'),
      );
      And('o saldo de "Bacon fatiado" no "Centro" é "940.000"', () =>
        w.expectBalance('Bacon fatiado', '940.000'),
      );
      And('a auditoria registra "ORDER_ROUND_SENT" feito por "joão"', () =>
        w.expectAudit('ORDER_ROUND_SENT', 'joão'),
      );
    },
  );

  Scenario(
    'Bebida sem preparo não vai para a cozinha e já fica pronta',
    ({ Given, When, Then, And }) => {
      Given('"joão" lançou 1 "Refrigerante lata" na mesa "10"', () =>
        w.add('joão', mesa10, 1, 'Refrigerante lata'),
      );
      When('"joão" envia a rodada da mesa "10"', () => w.send('joão', '10'));
      Then('a mesa "10" tem a rodada 1 com 1 item "PRONTO"', roundWith('PRONTO'));
      And('a cozinha do "Centro" recebeu 0 ticket novo', async () => {
        expect(await w.newTickets()).toBe(0);
      });
    },
  );

  Scenario('O garçom entrega a bebida pronta', ({ Given, And, When, Then }) => {
    Given('"joão" lançou 1 "Refrigerante lata" na mesa "10"', () =>
      w.add('joão', mesa10, 1, 'Refrigerante lata'),
    );
    And('"joão" enviou a rodada da mesa "10"', () => w.send('joão', '10'));
    When('"joão" entrega o primeiro item da mesa "10"', async () => {
      const item = await w.sentItem('10', 0);
      await w.services.orders.deliverItem(w.ctx('joão'), { itemId: item.id });
    });
    Then('o primeiro item da mesa "10" está "ENTREGUE"', async () => {
      expect((await w.sentItem('10', 0)).status).toBe('ENTREGUE');
    });
  });

  Scenario('Reenviar com a mesma chave não duplica', ({ Given, When, And, Then }) => {
    let first: unknown;
    Given('"joão" lançou 1 "X-Burger" na mesa "10"', () => w.add('joão', mesa10, 1, 'X-Burger'));
    When('"joão" envia a rodada da mesa "10" com a chave "k1"', async () => {
      await w.rememberScreen('10');
      await w.send('joão', '10', 'k1');
      first = w.lastSend;
    });
    And('"joão" reenvia a rodada da mesa "10" com a chave "k1"', async () => {
      // O reenvio manda o MESMO pedido (a tela não recebeu a resposta) e recebe a mesma resposta
      await w.sendScreen('joão', '10', 'k1');
      expect(w.lastSend).toEqual(first);
    });
    Then('a mesa "10" tem 1 rodada', rounds(1));
    And('o saldo de "Carne moída" no "Centro" é "850.000"', () =>
      w.expectBalance('Carne moída', '850.000'),
    );
  });

  Scenario(
    'Item enviado por outro garçom enquanto a tela estava aberta',
    ({ Given, And, When, Then }) => {
      Given('"joão" lançou 1 "X-Burger" na mesa "10"', () => w.add('joão', mesa10, 1, 'X-Burger'));
      And('outro garçom já enviou a rodada da mesa "10"', async () => {
        await w.rememberScreen('10');
        await w.person('ana', 'GARCOM');
        await w.send('ana', '10');
      });
      When('"joão" envia os itens que a tela dele mostrava', () =>
        w.attempt(() => w.sendScreen('joão', '10')),
      );
      Then('a ação é recusada com o código "ITEMS_CHANGED"', () => {
        w.expectFailure('ITEMS_CHANGED');
      });
      And('a mesa "10" tem 1 rodada', rounds(1));
    },
  );

  Scenario(
    'Sem estoque e com política de bloquear, nada é enviado',
    ({ Given, And, When, Then }) => {
      Given('a loja "Centro" bloqueia estoque negativo', () => w.blockNegative());
      And('"joão" lançou 7 "X-Burger" na mesa "10"', () => w.add('joão', mesa10, 7, 'X-Burger'));
      When('"joão" tenta enviar a rodada da mesa "10"', () =>
        w.attempt(() => w.send('joão', '10')),
      );
      Then('a ação é recusada com o código "INSUFFICIENT_STOCK"', () => {
        w.expectFailure('INSUFFICIENT_STOCK');
      });
      And('a conta da mesa "10" tem 1 item pendente', async () => {
        const detail = await w.order('10');
        expect(detail.pending).toHaveLength(1);
        expect(detail.rounds).toHaveLength(0);
        expect(await w.newTickets()).toBe(0);
      });
      And('o saldo de "Carne moída" no "Centro" é "1000.000"', () =>
        w.expectBalance('Carne moída', '1000.000'),
      );
    },
  );

  Scenario(
    'Sem estoque e com política de permitir, envia e avisa o garçom',
    ({ Given, When, Then, And }) => {
      Given('"joão" lançou 7 "X-Burger" na mesa "10"', () => w.add('joão', mesa10, 7, 'X-Burger'));
      When('"joão" envia a rodada da mesa "10"', () => w.send('joão', '10'));
      Then('o envio avisa que falta "Carne moída"', () => {
        expect(w.lastSend?.warnings).toEqual([
          expect.objectContaining({ name: 'Carne moída', balance: 1_000_000, required: 1_050_000 }),
        ]);
      });
      And('o saldo de "Carne moída" no "Centro" é "-50.000"', () =>
        w.expectBalance('Carne moída', '-50.000'),
      );
    },
  );
});
