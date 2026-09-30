import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { floorWorld } from './floor-world';

const feature = await loadFeature('tests/features/orders/comanda.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = floorWorld(db);

  Background(({ Given, And }) => {
    Given('que "joão" é garçom na loja "Centro"', () => w.first('joão', 'GARCOM'));
    And('a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"', () =>
      w.sells('X-Burger', '32,00', { modifier: ['Bacon', '5,00'] }),
    );
    And('existe a mesa "10" no "Centro"', () => w.createTable('10'));
  });

  const mesa10 = { table: '10' };
  const status = (expected: string) => async () => {
    expect(await w.floorStatus('10')).toBe(expected);
  };
  const subtotalIs = (text: string) => async () => {
    const detail = await w.order('10');
    expect(detail.subtotalCents).toBe(Number(text.replace(',', '')));
  };
  const pendingIs = (count: number) => async () => {
    expect((await w.order('10')).pending).toHaveLength(count);
  };

  Scenario('Abrir a mesa ocupa a mesa e cria a conta número 1 do dia', ({ When, Then, And }) => {
    When('"joão" abre a mesa "10" para 4 pessoas', () => w.open('joão', '10', 4));
    Then('o mapa do "Centro" mostra a mesa "10" como "OCUPADA"', status('OCUPADA'));
    And('a conta da mesa "10" tem o número 1', async () => {
      const detail = await w.order('10');
      expect(detail.number).toBe(1);
      expect(detail.guests).toBe(4);
      expect(detail.label).toBe('10');
    });
    And('a auditoria registra "ORDER_OPENED" feito por "joão"', () =>
      w.expectAudit('ORDER_OPENED', 'joão'),
    );
  });

  Scenario('Mesa ocupada não abre de novo', ({ Given, When, Then }) => {
    Given('"joão" abriu a mesa "10"', () => w.open('joão', '10'));
    When('"joão" tenta abrir a mesa "10"', () => w.attempt(() => w.open('joão', '10')));
    Then('a ação é recusada com o código "TABLE_NOT_AVAILABLE"', () => {
      w.expectFailure('TABLE_NOT_AVAILABLE');
    });
  });

  Scenario('Lançar item com adicional e observação', ({ Given, When, Then, And }) => {
    Given('"joão" abriu a mesa "10"', () => w.open('joão', '10'));
    When('"joão" lança 2 "X-Burger" com "Bacon" e a observação "sem cebola" na mesa "10"', () =>
      w.add('joão', mesa10, 2, 'X-Burger', { modifier: 'Bacon', notes: 'sem cebola' }),
    );
    Then('a conta da mesa "10" tem 1 item pendente', async () => {
      await pendingIs(1)();
      const [item] = (await w.order('10')).pending;
      expect(item).toMatchObject({
        productName: 'X-Burger',
        quantity: 2,
        notes: 'sem cebola',
        unitPriceCents: 3200,
        modifiersCents: 500,
        modifiers: [expect.objectContaining({ name: 'Bacon', priceDeltaCents: 500 })],
      });
    });
    And('o subtotal da conta da mesa "10" é "74,00"', subtotalIs('74,00'));
  });

  Scenario('O preço fica congelado no lançamento', ({ Given, And, When, Then }) => {
    Given('"joão" abriu a mesa "10"', () => w.open('joão', '10'));
    And('"joão" lançou 1 "X-Burger" na mesa "10"', () => w.add('joão', mesa10, 1, 'X-Burger'));
    When('o preço do "X-Burger" no "Centro" muda para "40,00"', () =>
      w.setPrice('X-Burger', '40,00'),
    );
    Then('o subtotal da conta da mesa "10" é "32,00"', subtotalIs('32,00'));
  });

  Scenario('Produto esgotado não pode ser lançado', ({ Given, And, When, Then }) => {
    Given('"joão" abriu a mesa "10"', () => w.open('joão', '10'));
    And('o "X-Burger" acabou no "Centro"', async () => {
      await w.services.catalog.setAvailability(w.ctx('sistema'), {
        productId: w.product('X-Burger'),
        available: false,
      });
    });
    When('"joão" tenta lançar 1 "X-Burger" na mesa "10"', () =>
      w.attempt(() => w.add('joão', mesa10, 1, 'X-Burger')),
    );
    Then('a ação é recusada com o código "PRODUCT_NOT_AVAILABLE"', () => {
      w.expectFailure('PRODUCT_NOT_AVAILABLE');
    });
  });

  Scenario('Remover item ainda não enviado', ({ Given, And, When, Then }) => {
    Given('"joão" abriu a mesa "10"', () => w.open('joão', '10'));
    And('"joão" lançou 1 "X-Burger" na mesa "10"', () => w.add('joão', mesa10, 1, 'X-Burger'));
    When('"joão" remove o primeiro item da mesa "10"', async () => {
      const [itemId] = await w.pendingIds('10');
      if (!itemId) throw new Error('sem item');
      await w.services.orders.removeItem(w.ctx('joão'), { itemId });
    });
    Then('a conta da mesa "10" tem 0 item pendente', pendingIs(0));
    And('o subtotal da conta da mesa "10" é "0,00"', subtotalIs('0,00'));
  });

  Scenario('Pedido de balcão com nome livre', ({ When, And, Then }) => {
    When('"joão" abre uma conta de balcão para "Maria"', () => w.openCounter('joão', 'Maria'));
    And('"joão" lança 1 "X-Burger" na conta de balcão "Maria"', () =>
      w.add('joão', { counter: 'Maria' }, 1, 'X-Burger'),
    );
    Then('a lista de balcão do "Centro" mostra "Maria"', async () => {
      const { counter } = await w.services.orders.floor(w.ctx('joão'));
      expect(counter).toEqual([
        expect.objectContaining({ label: 'Maria', type: 'BALCAO', subtotalCents: 3200 }),
      ]);
    });
  });
});
