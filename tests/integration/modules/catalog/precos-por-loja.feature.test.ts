import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { catalogWorld, cents } from './catalog-world';

const feature = await loadFeature('tests/features/catalog/precos-por-loja.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  const w = catalogWorld(db);

  Scenario('O mesmo produto com preços diferentes em duas lojas', ({ Given, And, When, Then }) => {
    Given('que "dona" é administradora da organização', () => w.admin('dona'));
    And('existe a categoria "Lanches"', () => w.createCategory('Lanches'));
    And('"dona" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja', () =>
      w.createProduct('dona', { name: 'X-Burger', category: 'Lanches', price: '32,00' }),
    );
    When('"dona" define o preço de "X-Burger" na loja "Praia" como "35,00"', () =>
      w.setPrice('dona', 'X-Burger', 'Praia', '35,00'),
    );
    Then('o cardápio da loja "Centro" tem "X-Burger" por 3200 centavos', () =>
      w.expectOnMenu('Centro', 'X-Burger', 3200),
    );
    And('o cardápio da loja "Praia" tem "X-Burger" por 3500 centavos', () =>
      w.expectOnMenu('Praia', 'X-Burger', 3500),
    );
  });

  Scenario('Produto sem preço na loja não é vendido nela', ({ Given, And, Then }) => {
    Given('que "dona" é administradora da organização', () => w.admin('dona'));
    And('existe a categoria "Lanches"', () => w.createCategory('Lanches'));
    And('"dona" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja', () =>
      w.createProduct('dona', { name: 'X-Burger', category: 'Lanches', price: '32,00' }),
    );
    Then('o cardápio da loja "Praia" não tem "X-Burger"', () =>
      w.expectNotOnMenu('Praia', 'X-Burger'),
    );
  });

  Scenario('Gerente de uma loja não altera o preço de outra', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('existe a categoria "Lanches"', () => w.createCategory('Lanches'));
    And('"carla" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja', () =>
      w.createProduct('carla', { name: 'X-Burger', category: 'Lanches', price: '32,00' }),
    );
    When('"carla" tenta definir o preço de "X-Burger" na loja "Praia" como "1,00"', () =>
      w.attempt(() => w.setPrice('carla', 'X-Burger', 'Praia', '1,00')),
    );
    Then('a ação é negada por falta de permissão', () => {
      w.expectFailure('FORBIDDEN');
    });
  });

  Scenario('Dois gerentes alteram o mesmo preço ao mesmo tempo', ({ Given, And, When, Then }) => {
    let shownVersion = -1;
    const save = (price: string) =>
      w.catalog.setStorePrice(w.ctx('carla'), {
        productId: w.product('X-Burger'),
        storeId: w.storeId('Centro'),
        priceCents: cents(price),
        version: shownVersion,
      });

    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('existe a categoria "Lanches"', () => w.createCategory('Lanches'));
    And('"carla" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja', () =>
      w.createProduct('carla', { name: 'X-Burger', category: 'Lanches', price: '32,00' }),
    );
    And('duas telas abertas mostram o preço de "X-Burger" no "Centro"', async () => {
      const view = await w.catalog.getProduct(w.ctx('carla'), w.product('X-Burger'));
      const price = view.prices.find((item) => item.storeId === w.storeId('Centro'))?.price;
      expect(price).toBeDefined();
      shownVersion = price?.version ?? -1;
    });
    When('a primeira tela salva "33,00"', () => save('33,00'));
    And('a segunda tela tenta salvar "34,00"', () => w.attempt(() => save('34,00')));
    Then('a ação é recusada com o código "CONCURRENT_MODIFICATION"', () => {
      w.expectFailure('CONCURRENT_MODIFICATION');
    });
    And('o cardápio da loja "Centro" tem "X-Burger" por 3300 centavos', () =>
      w.expectOnMenu('Centro', 'X-Burger', 3300),
    );
  });
});
