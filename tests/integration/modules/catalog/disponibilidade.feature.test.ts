import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { useTestDatabase } from '../../../support/database';
import { catalogWorld } from './catalog-world';

const feature = await loadFeature('tests/features/catalog/disponibilidade.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  const w = catalogWorld(db);

  const mark = (who: string, product: string, available: boolean) =>
    w.catalog.setAvailability(w.ctx(who), { productId: w.product(product), available });

  Scenario('Cozinha marca que acabou só na própria loja', ({ Given, And, When, Then }) => {
    Given('que "dona" é administradora da organização', () => w.admin('dona'));
    And('existe a categoria "Lanches"', () => w.createCategory('Lanches'));
    And('"dona" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja', () =>
      w.createProduct('dona', { name: 'X-Burger', category: 'Lanches', price: '32,00' }),
    );
    And('"dona" definiu o preço de "X-Burger" na loja "Praia" como "35,00"', () =>
      w.setPrice('dona', 'X-Burger', 'Praia', '35,00'),
    );
    And('"teo" é da cozinha na loja "Centro"', () =>
      w.addPerson('teo', 'COZINHA', { store: 'Centro' }),
    );
    When('"teo" marca que "X-Burger" acabou', () => mark('teo', 'X-Burger', false));
    Then('o cardápio da loja "Centro" não tem "X-Burger"', () =>
      w.expectNotOnMenu('Centro', 'X-Burger'),
    );
    And('o cardápio da loja "Praia" tem "X-Burger" por 3500 centavos', () =>
      w.expectOnMenu('Praia', 'X-Burger', 3500),
    );
    And('a auditoria registra o evento "PRODUCT_AVAILABILITY_CHANGED" feito por "teo"', () =>
      w.expectAudit('PRODUCT_AVAILABILITY_CHANGED', 'teo'),
    );
  });

  Scenario('Marcar de novo como disponível', ({ Given, And, When, Then }) => {
    Given('que "dona" é administradora da organização', () => w.admin('dona'));
    And('existe a categoria "Lanches"', () => w.createCategory('Lanches'));
    And('"dona" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja', () =>
      w.createProduct('dona', { name: 'X-Burger', category: 'Lanches', price: '32,00' }),
    );
    And('"teo" é da cozinha na loja "Centro"', () =>
      w.addPerson('teo', 'COZINHA', { store: 'Centro' }),
    );
    And('"teo" marcou que "X-Burger" acabou', () => mark('teo', 'X-Burger', false));
    When('"teo" marca que "X-Burger" está disponível', () => mark('teo', 'X-Burger', true));
    Then('o cardápio da loja "Centro" tem "X-Burger" por 3200 centavos', () =>
      w.expectOnMenu('Centro', 'X-Burger', 3200),
    );
  });

  Scenario('Garçom não marca disponibilidade', ({ Given, And, When, Then }) => {
    Given('que "dona" é administradora da organização', () => w.admin('dona'));
    And('existe a categoria "Lanches"', () => w.createCategory('Lanches'));
    And('"dona" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja', () =>
      w.createProduct('dona', { name: 'X-Burger', category: 'Lanches', price: '32,00' }),
    );
    And('"joao" é garçom na loja "Centro"', () =>
      w.addPerson('joao', 'GARCOM', { store: 'Centro' }),
    );
    When('"joao" tenta marcar que "X-Burger" acabou', () =>
      w.attempt(() => mark('joao', 'X-Burger', false)),
    );
    Then('a ação é negada por falta de permissão', () => {
      w.expectFailure('FORBIDDEN');
    });
  });
});
