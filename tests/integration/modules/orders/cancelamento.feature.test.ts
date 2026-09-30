import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { floorWorld } from './floor-world';

const feature = await loadFeature('tests/features/orders/cancelamento.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = floorWorld(db);
  const mesa10 = { table: '10' };

  Background(({ Given, And }) => {
    Given('que "carla" é gerente na loja "Centro" com o PIN "246810"', () =>
      w.first('carla', 'GERENTE', '246810'),
    );
    And('"joão" é garçom na loja "Centro"', () => w.person('joão', 'GARCOM'));
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
    And('existe a mesa "10" no "Centro"', () => w.createTable('10'));
    And('"joão" abriu a mesa "10"', () => w.open('joão', '10'));
    And('"joão" lançou 1 "X-Burger" na mesa "10"', () => w.add('joão', mesa10, 1, 'X-Burger'));
    And('"joão" enviou a rodada da mesa "10"', () => w.send('joão', '10'));
  });

  Scenario('Garçom sem autorização não cancela', ({ When, Then }) => {
    When('"joão" tenta cancelar o primeiro item da mesa "10" pelo motivo "cliente desistiu"', () =>
      w.attempt(() => w.cancel('joão', '10', 0, 'cliente desistiu')),
    );
    Then('a ação é recusada com o código "FORBIDDEN"', () => {
      w.expectFailure('FORBIDDEN');
      expect(w.failure).toMatchObject({ details: { elevationAllowed: true } });
    });
  });

  Scenario('Gerente autoriza com PIN e o insumo volta ao estoque', ({ Given, When, Then, And }) => {
    Given('"carla" autorizou no aparelho de "joão" o cancelamento com o PIN "246810"', () =>
      w.authorize('carla', 'joão', '246810'),
    );
    When('"joão" cancela o primeiro item da mesa "10" pelo motivo "cliente desistiu"', () =>
      w.cancel('joão', '10', 0, 'cliente desistiu'),
    );
    Then('o primeiro item da mesa "10" está "CANCELADO"', async () => {
      expect(await w.sentItem('10', 0)).toMatchObject({
        status: 'CANCELADO',
        cancelReason: 'cliente desistiu',
      });
    });
    And('o saldo de "Carne moída" no "Centro" é "1000.000"', () =>
      w.expectBalance('Carne moída', '1000.000'),
    );
    And('o subtotal da conta da mesa "10" é "0,00"', async () => {
      expect((await w.order('10')).subtotalCents).toBe(0);
      // Ticket só com item cancelado sai da fila da cozinha (RN-ORD-14)
      expect(await w.newTickets()).toBe(0);
    });
    And(
      'a auditoria registra "ORDER_ITEM_CANCELLED" feito por "joão" com autorização de "carla"',
      () => w.expectAudit('ORDER_ITEM_CANCELLED', 'joão', 'carla'),
    );
  });

  Scenario('A autorização vale uma vez só', ({ Given, And, When, Then }) => {
    Given('"carla" autorizou no aparelho de "joão" o cancelamento com o PIN "246810"', () =>
      w.authorize('carla', 'joão', '246810'),
    );
    And('"joão" lançou 1 "X-Burger" na mesa "10"', () => w.add('joão', mesa10, 1, 'X-Burger'));
    And('"joão" enviou a rodada da mesa "10"', () => w.send('joão', '10'));
    And('"joão" cancelou o primeiro item da mesa "10" pelo motivo "cliente desistiu"', () =>
      w.cancel('joão', '10', 0, 'cliente desistiu'),
    );
    When('"joão" tenta cancelar o segundo item da mesa "10" pelo motivo "cliente desistiu"', () =>
      w.attempt(() => w.cancel('joão', '10', 1, 'cliente desistiu')),
    );
    Then('a ação é recusada com o código "ELEVATED_GRANT_INVALID"', () => {
      w.expectFailure('ELEVATED_GRANT_INVALID');
    });
  });

  Scenario('Motivo é obrigatório', ({ When, Then }) => {
    When('"carla" tenta cancelar o primeiro item da mesa "10" pelo motivo ""', () =>
      w.attempt(() => w.cancel('carla', '10', 0, '')),
    );
    Then('a ação é recusada com o código "CANCEL_REASON_REQUIRED"', () => {
      w.expectFailure('CANCEL_REASON_REQUIRED');
    });
  });

  Scenario('Cancelado depois do preparo vira perda', ({ Given, When, Then, And }) => {
    Given('a cozinha começou a preparar o primeiro item da mesa "10"', () =>
      w.startPreparing('10', 0),
    );
    When('"carla" cancela o primeiro item da mesa "10" pelo motivo "caiu no chão"', () =>
      w.cancel('carla', '10', 0, 'caiu no chão'),
    );
    Then('o saldo de "Carne moída" no "Centro" é "850.000"', () =>
      w.expectBalance('Carne moída', '850.000'),
    );
    And('as perdas do dia no "Centro" somam 600 centavos', async () => {
      expect(await w.losses()).toBe(600);
    });
  });
});
