import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { runInTransaction } from '@/shared/db/transaction';
import type { Id } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import { stockWorld } from './stock-world';

const feature = await loadFeature('tests/features/inventory/baixa-por-venda.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = stockWorld(db);
  let item: Id;

  Background(({ Given, And }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('existe o insumo "Carne moída" em "g"', () => w.createIngredient('Carne moída', 'g'));
    And('"carla" lançou a entrada de "1" "kg" de "Carne moída" pagando "40,00"', () =>
      w.entry('carla', 'Carne moída', '1', 'kg', '40,00'),
    );
  });

  const send = async (grams: number) => {
    item = await w.consume('Carne moída', grams * 1000);
  };

  Scenario('Enviar o item para a cozinha baixa o insumo', ({ When, Then, And }) => {
    When('um item que usa "150" "g" de "Carne moída" é enviado para a cozinha', () => send(150));
    Then('o saldo de "Carne moída" no "Centro" é "850.000"', () =>
      w.expectBalance('Carne moída', '850.000'),
    );
    And('o CMV do dia no "Centro" é de 600 centavos', async () => {
      expect(await w.cmv('Centro')).toBe(600);
    });
  });

  Scenario('Cancelado antes do preparo volta ao estoque', ({ Given, When, Then, And }) => {
    Given('um item que usa "150" "g" de "Carne moída" foi enviado para a cozinha', () => send(150));
    When('o item é cancelado antes do preparo', async () => {
      await runInTransaction(db, (tx) =>
        w.services.inventory.reverseConsumption(tx, w.ctx('carla'), item),
      );
      // Cancelar de novo não faz nada (RN-INV-13)
      await runInTransaction(db, (tx) =>
        w.services.inventory.reverseConsumption(tx, w.ctx('carla'), item),
      );
    });
    Then('o saldo de "Carne moída" no "Centro" é "1000.000"', () =>
      w.expectBalance('Carne moída', '1000.000'),
    );
    And('o CMV do dia no "Centro" é de 0 centavos', async () => {
      expect(await w.cmv('Centro')).toBe(0);
    });
  });

  Scenario('Cancelado depois do preparo vira perda', ({ Given, When, Then, And }) => {
    Given('um item que usa "150" "g" de "Carne moída" foi enviado para a cozinha', () => send(150));
    When('o item é cancelado depois do preparo', () =>
      runInTransaction(db, (tx) =>
        w.services.inventory.consumptionToLoss(tx, w.ctx('carla'), item),
      ),
    );
    Then('o saldo de "Carne moída" no "Centro" é "850.000"', () =>
      w.expectBalance('Carne moída', '850.000'),
    );
    And('o CMV do dia no "Centro" é de 0 centavos', async () => {
      expect(await w.cmv('Centro')).toBe(0);
    });
    And('as perdas do dia no "Centro" somam 600 centavos', async () => {
      expect(await w.losses('Centro')).toBe(600);
    });
  });

  Scenario(
    'Sem estoque e com política de bloquear, o envio é recusado',
    ({ Given, When, Then, And }) => {
      Given('a loja "Centro" bloqueia estoque negativo', () => w.blockNegative('Centro'));
      When('um item que usa "1200" "g" de "Carne moída" tenta ser enviado para a cozinha', () =>
        w.attempt(() => send(1200)),
      );
      Then('a ação é recusada com o código "INSUFFICIENT_STOCK"', () => {
        w.expectFailure('INSUFFICIENT_STOCK');
        expect(w.failure).toMatchObject({
          message: 'Estoque insuficiente: Carne moída tem 1.000 g, precisa de 1.200 g.',
        });
      });
      And('o saldo de "Carne moída" no "Centro" é "1000.000"', () =>
        w.expectBalance('Carne moída', '1000.000'),
      );
    },
  );

  Scenario('Sem estoque e com política de permitir, envia com alerta', ({ When, Then, And }) => {
    When('um item que usa "1200" "g" de "Carne moída" é enviado para a cozinha', () => send(1200));
    Then('o saldo de "Carne moída" no "Centro" é "-200.000"', () =>
      w.expectBalance('Carne moída', '-200.000'),
    );
    And('o envio avisa que falta "Carne moída"', () => {
      expect(w.lastWarnings).toEqual([
        expect.objectContaining({ name: 'Carne moída', balance: 1_000_000, required: 1_200_000 }),
      ]);
    });
  });
});
