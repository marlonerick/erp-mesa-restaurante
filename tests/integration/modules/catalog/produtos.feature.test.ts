import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { catalogWorld } from './catalog-world';

const feature = await loadFeature('tests/features/catalog/produtos.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  const w = catalogWorld(db);

  /** Como a tela: lê o produto (versão) e muda a situação. */
  async function setActive(name: string, active: boolean) {
    const product = await w.catalog.getProduct(w.ctx('carla'), w.product(name));
    await w.catalog.setProductStatus(w.ctx('carla'), {
      productId: product.id,
      version: product.version,
      active,
    });
  }

  Scenario('Gerente cadastra um produto com preço na loja', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('existe a categoria "Lanches"', () => w.createCategory('Lanches'));
    When('"carla" cadastra o produto "X-Burger" em "Lanches" custando "32,50" nesta loja', () =>
      w.createProduct('carla', { name: 'X-Burger', category: 'Lanches', price: '32,50' }),
    );
    Then('o cardápio da loja "Centro" tem "X-Burger" por 3250 centavos', () =>
      w.expectOnMenu('Centro', 'X-Burger', 3250),
    );
    And('a auditoria registra o evento "PRODUCT_CREATED" feito por "carla"', () =>
      w.expectAudit('PRODUCT_CREATED', 'carla'),
    );
  });

  Scenario('Nome repetido na empresa é recusado', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('existe a categoria "Lanches"', () => w.createCategory('Lanches'));
    And('"carla" cadastrou o produto "X-Burger" em "Lanches" custando "32,50" nesta loja', () =>
      w.createProduct('carla', { name: 'X-Burger', category: 'Lanches', price: '32,50' }),
    );
    When('"carla" tenta cadastrar o produto "x-burger" em "Lanches"', () =>
      w.attempt(() => w.createProduct('carla', { name: 'x-burger', category: 'Lanches' })),
    );
    Then('a ação é recusada com o código "PRODUCT_NAME_TAKEN"', () => {
      w.expectFailure('PRODUCT_NAME_TAKEN');
    });
  });

  Scenario(
    'Produto desativado sai do cardápio e volta com o mesmo preço',
    ({ Given, And, When, Then }) => {
      Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
      And('existe a categoria "Lanches"', () => w.createCategory('Lanches'));
      And('"carla" cadastrou o produto "X-Burger" em "Lanches" custando "32,50" nesta loja', () =>
        w.createProduct('carla', { name: 'X-Burger', category: 'Lanches', price: '32,50' }),
      );
      When('"carla" desativa o produto "X-Burger"', () => setActive('X-Burger', false));
      Then('o cardápio da loja "Centro" não tem "X-Burger"', () =>
        w.expectNotOnMenu('Centro', 'X-Burger'),
      );
      When('"carla" reativa o produto "X-Burger"', () => setActive('X-Burger', true));
      Then('o cardápio da loja "Centro" tem "X-Burger" por 3250 centavos', () =>
        w.expectOnMenu('Centro', 'X-Burger', 3250),
      );
    },
  );

  Scenario('Garçom não cadastra produtos', ({ Given, And, When, Then }) => {
    Given('que "joao" é garçom na loja "Centro"', async () => {
      await w.newOrganization();
      await w.addPerson('joao', 'GARCOM', { store: 'Centro' });
    });
    And('existe a categoria "Lanches"', () => w.createCategory('Lanches'));
    When('"joao" tenta cadastrar o produto "X-Salada" em "Lanches"', () =>
      w.attempt(() => w.createProduct('joao', { name: 'X-Salada', category: 'Lanches' })),
    );
    Then('a ação é negada por falta de permissão', () => {
      expect(w.failure).toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
