import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { quantityText, stockWorld } from './stock-world';

const feature = await loadFeature('tests/features/inventory/movimentacoes.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  const w = stockWorld(db);

  Scenario('Compra em quilos vira gramas e define o custo médio', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('existe o insumo "Carne moída" em "g"', () => w.createIngredient('Carne moída', 'g'));
    When('"carla" lança a entrada de "2" "kg" de "Carne moída" pagando "80,00"', () =>
      w.entry('carla', 'Carne moída', '2', 'kg', '80,00'),
    );
    Then('o saldo de "Carne moída" no "Centro" é "2000.000" com custo médio "0.040000"', () =>
      w.expectBalance('Carne moída', '2000.000', '0.040000'),
    );
    And('a auditoria registra o evento "STOCK_ENTRY" feito por "carla"', () =>
      w.expectAudit('STOCK_ENTRY', 'carla'),
    );
  });

  Scenario('Segunda compra recalcula o custo médio', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('existe o insumo "Carne moída" em "g"', () => w.createIngredient('Carne moída', 'g'));
    And('"carla" lançou a entrada de "2" "kg" de "Carne moída" pagando "80,00"', () =>
      w.entry('carla', 'Carne moída', '2', 'kg', '80,00'),
    );
    When('"carla" lança a entrada de "1" "kg" de "Carne moída" pagando "46,00"', () =>
      w.entry('carla', 'Carne moída', '1', 'kg', '46,00'),
    );
    Then('o saldo de "Carne moída" no "Centro" é "3000.000" com custo médio "0.042000"', () =>
      w.expectBalance('Carne moída', '3000.000', '0.042000'),
    );
  });

  Scenario('Contagem grava só a diferença', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('existe o insumo "Pão de hambúrguer" em "un"', () =>
      w.createIngredient('Pão de hambúrguer', 'un'),
    );
    And('"carla" lançou a entrada de "50" "un" de "Pão de hambúrguer" pagando "40,00"', () =>
      w.entry('carla', 'Pão de hambúrguer', '50', 'un', '40,00'),
    );
    When('"carla" informa a contagem de "47" "un" de "Pão de hambúrguer"', async () => {
      await w.services.inventory.registerCount(w.ctx('carla'), {
        ingredientId: w.ingredient('Pão de hambúrguer'),
        quantity: '47',
        unit: 'un',
      });
    });
    Then('o saldo de "Pão de hambúrguer" no "Centro" é "47.000"', () =>
      w.expectBalance('Pão de hambúrguer', '47.000'),
    );
    And('o extrato de "Pão de hambúrguer" termina com um "AJUSTE" de "-3.000"', async () => {
      const [last] = (await w.stock('Pão de hambúrguer')).movements;
      expect(last?.type).toBe('AJUSTE');
      expect(quantityText(last?.quantity ?? 0)).toBe('-3.000');
    });
  });

  Scenario(
    'Perda com política de bloquear não deixa o saldo negativo',
    ({ Given, And, When, Then }) => {
      Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
      And('a loja "Centro" bloqueia estoque negativo', () => w.blockNegative('Centro'));
      And('existe o insumo "Queijo" em "g"', () => w.createIngredient('Queijo', 'g'));
      And('"carla" lançou a entrada de "500" "g" de "Queijo" pagando "25,00"', () =>
        w.entry('carla', 'Queijo', '500', 'g', '25,00'),
      );
      When('"carla" tenta lançar a perda de "600" "g" de "Queijo" por "ESTRAGADO"', () =>
        w.attempt(() =>
          w.services.inventory.registerLoss(w.ctx('carla'), {
            ingredientId: w.ingredient('Queijo'),
            quantity: '600',
            unit: 'g',
            reason: 'ESTRAGADO',
          }),
        ),
      );
      Then('a ação é recusada com o código "INSUFFICIENT_STOCK"', () => {
        w.expectFailure('INSUFFICIENT_STOCK');
      });
      And('o saldo de "Queijo" no "Centro" é "500.000"', () =>
        w.expectBalance('Queijo', '500.000'),
      );
    },
  );

  Scenario('Alerta de estoque mínimo', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('existe o insumo "Queijo" em "g"', () => w.createIngredient('Queijo', 'g'));
    And('o mínimo de "Queijo" no "Centro" é "1000"', () =>
      w.services.inventory.setMinimum(w.ctx('carla'), {
        ingredientId: w.ingredient('Queijo'),
        minimum: '1000',
      }),
    );
    When('"carla" lança a entrada de "800" "g" de "Queijo" pagando "40,00"', () =>
      w.entry('carla', 'Queijo', '800', 'g', '40,00'),
    );
    Then('"Queijo" aparece abaixo do mínimo com saldo "800.000" e mínimo "1000.000"', async () => {
      const below = await w.services.inventory.listIngredients(w.ctx('carla'), {
        belowMinimumOnly: true,
      });
      expect(below).toHaveLength(1);
      expect(below[0]?.name).toBe('Queijo');
      expect(quantityText(below[0]?.quantity ?? 0)).toBe('800.000');
      expect(quantityText(below[0]?.minQuantity ?? 0)).toBe('1000.000');
    });
  });

  Scenario('Cozinha vê o estoque mas não lança', ({ Given, And, When, Then }) => {
    Given('que "teo" é da cozinha na loja "Centro"', async () => {
      await w.newOrganization();
      await w.addPerson('teo', 'COZINHA', { store: 'Centro' });
    });
    And('existe o insumo "Queijo" em "g"', () => w.createIngredient('Queijo', 'g'));
    When('"teo" tenta lançar a entrada de "1" "kg" de "Queijo" pagando "50,00"', () =>
      w.attempt(() => w.entry('teo', 'Queijo', '1', 'kg', '50,00')),
    );
    Then('a ação é negada por falta de permissão', async () => {
      w.expectFailure('FORBIDDEN');
      // ...mas consegue ver o estoque (inventory.read)
      await expect(w.services.inventory.listIngredients(w.ctx('teo'))).resolves.toHaveLength(1);
    });
  });
});
