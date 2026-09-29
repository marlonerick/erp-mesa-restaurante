import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { catalogWorld } from './catalog-world';

const feature = await loadFeature('tests/features/catalog/categorias.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  const w = catalogWorld(db);

  /** Como a tela: lê a categoria (versão) e salva desativada. */
  async function disable(name: string) {
    const current = await w.catalog.getCategory(w.ctx('carla'), w.category(name));
    await w.catalog.updateCategory(w.ctx('carla'), {
      categoryId: current.id,
      version: current.version,
      name: current.name,
      active: false,
    });
  }

  Scenario('Categoria nova entra no fim e pode subir', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('existem as categorias "Lanches", "Bebidas" e "Sobremesas"', async () => {
      for (const name of ['Lanches', 'Bebidas', 'Sobremesas']) {
        await w.createCategory(name, 'carla');
      }
    });
    When('"carla" sobe a categoria "Sobremesas"', () =>
      w.catalog.moveCategory(w.ctx('carla'), {
        categoryId: w.category('Sobremesas'),
        direction: 'UP',
      }),
    );
    Then('a ordem das categorias é "Lanches", "Sobremesas", "Bebidas"', async () => {
      const list = await w.catalog.listCategories(w.ctx('carla'));
      expect(list.map((item) => item.name)).toEqual(['Lanches', 'Sobremesas', 'Bebidas']);
    });
  });

  Scenario(
    'Categoria desativada tira os produtos dela do cardápio',
    ({ Given, And, When, Then }) => {
      Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
      And('existe a categoria "Sobremesas"', () => w.createCategory('Sobremesas'));
      And('"carla" cadastrou o produto "Pudim" em "Sobremesas" custando "12" nesta loja', () =>
        w.createProduct('carla', { name: 'Pudim', category: 'Sobremesas', price: '12' }),
      );
      When('"carla" desativa a categoria "Sobremesas"', () => disable('Sobremesas'));
      Then('o cardápio da loja "Centro" não tem "Pudim"', () =>
        w.expectNotOnMenu('Centro', 'Pudim'),
      );
      And('o produto "Pudim" continua ativo', async () => {
        expect((await w.catalog.getProduct(w.ctx('carla'), w.product('Pudim'))).active).toBe(true);
      });
    },
  );

  Scenario('Categoria desativada não recebe produto novo', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('existe a categoria "Sobremesas"', () => w.createCategory('Sobremesas'));
    And('"carla" desativou a categoria "Sobremesas"', () => disable('Sobremesas'));
    When('"carla" tenta cadastrar o produto "Mousse" em "Sobremesas"', () =>
      w.attempt(() => w.createProduct('carla', { name: 'Mousse', category: 'Sobremesas' })),
    );
    Then('a ação é recusada com o código "CATEGORY_INACTIVE"', () => {
      w.expectFailure('CATEGORY_INACTIVE');
    });
  });
});
