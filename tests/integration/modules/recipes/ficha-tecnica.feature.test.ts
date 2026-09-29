import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { consumptionForItems, type RecipeKind } from '@/modules/recipes';
import { runInTransaction } from '@/shared/db/transaction';
import { type Id, newId } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import { quantityText, stockWorld } from '../inventory/stock-world';

const feature = await loadFeature('tests/features/recipes/ficha-tecnica.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = stockWorld(db);

  /** Como a tela: lê a versão da ficha e salva as linhas. */
  async function save(
    by: string,
    kind: RecipeKind,
    id: Id,
    lines: [string, string][],
    version?: number | null,
  ) {
    const current =
      version === undefined
        ? (await w.services.recipes.getRecipe(w.ctx('sistema'), { kind, id })).version
        : version;
    await w.services.recipes.saveRecipe(w.ctx(by), {
      kind,
      id,
      version: current,
      lines: lines.map(([ingredient, quantity]) => ({
        ingredientId: w.ingredient(ingredient),
        quantity,
      })),
    });
  }

  const burgerLines: [string, string][] = [
    ['Pão de hambúrguer', '1'],
    ['Carne moída', '150'],
  ];

  Background(({ Given, And }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('existe o insumo "Pão de hambúrguer" em "un" custando "0.800000" no "Centro"', () =>
      w.ingredientWithCost('Pão de hambúrguer', 'un', '0.800000'),
    );
    And('existe o insumo "Carne moída" em "g" custando "0.040000" no "Centro"', () =>
      w.ingredientWithCost('Carne moída', 'g', '0.040000'),
    );
    And('existe o produto "X-Burger" custando "32,00" no "Centro"', () =>
      w.createProduct('X-Burger', '32,00'),
    );
  });

  Scenario('Ficha do produto mostra custo teórico e margem', ({ When, Then, And }) => {
    When(
      '"carla" salva a ficha de "X-Burger" com "1" de "Pão de hambúrguer" e "150" de "Carne moída"',
      () => save('carla', 'PRODUCT', w.product('X-Burger'), burgerLines),
    );
    Then('o custo teórico de "X-Burger" é de 680 centavos', async () => {
      const recipe = await w.services.recipes.getRecipe(w.ctx('carla'), {
        kind: 'PRODUCT',
        id: w.product('X-Burger'),
      });
      expect(recipe.costCents).toBe(680);
      expect(recipe.lines.map((line) => line.lineCostCents)).toEqual([80, 600]);
    });
    And('a margem de "X-Burger" é "78,8%"', async () => {
      const list = await w.services.recipes.listRecipes(w.ctx('carla'));
      const burger = list.products.find((item) => item.name === 'X-Burger');
      expect(burger).toMatchObject({ hasRecipe: true, costCents: 680, marginTenths: 788 });
    });
    And('a auditoria registra o evento "RECIPE_UPDATED" feito por "carla"', () =>
      w.expectAudit('RECIPE_UPDATED', 'carla'),
    );
  });

  Scenario('A ficha do adicional soma no consumo do item', ({ Given, And, When, Then }) => {
    let lines: { ingredientId: Id; quantity: number }[] = [];
    Given('existe o insumo "Bacon" em "g" custando "0.060000" no "Centro"', () =>
      w.ingredientWithCost('Bacon', 'g', '0.060000'),
    );
    And('existe o adicional "Bacon extra" no grupo "Extras"', () =>
      w.createModifier('Bacon extra', 'Extras'),
    );
    And(
      '"carla" salvou a ficha de "X-Burger" com "1" de "Pão de hambúrguer" e "150" de "Carne moída"',
      () => save('carla', 'PRODUCT', w.product('X-Burger'), burgerLines),
    );
    And('"carla" salvou a ficha do adicional "Bacon extra" com "30" de "Bacon"', () =>
      save('carla', 'MODIFIER', w.modifier('Bacon extra'), [['Bacon', '30']]),
    );
    When('se calcula o consumo de 2 "X-Burger" com "Bacon extra"', async () => {
      lines = await runInTransaction(db, (tx) =>
        consumptionForItems(tx, w.org.companyId, [
          {
            originId: newId(),
            productId: w.product('X-Burger'),
            quantity: 2000,
            modifiers: [{ modifierId: w.modifier('Bacon extra'), quantity: 1000 }],
          },
        ]),
      );
    });
    Then(
      'o consumo é "2.000" de "Pão de hambúrguer", "300.000" de "Carne moída" e "60.000" de "Bacon"',
      () => {
        const of = (name: string) =>
          quantityText(
            lines.find((line) => line.ingredientId === w.ingredient(name))?.quantity ?? 0,
          );
        expect(lines).toHaveLength(3);
        expect(of('Pão de hambúrguer')).toBe('2.000');
        expect(of('Carne moída')).toBe('300.000');
        expect(of('Bacon')).toBe('60.000');
      },
    );
  });

  Scenario('Duas pessoas salvando a mesma ficha', ({ Given, And, When, Then }) => {
    let shown: number | null = null;
    Given(
      '"carla" salvou a ficha de "X-Burger" com "1" de "Pão de hambúrguer" e "150" de "Carne moída"',
      () => save('carla', 'PRODUCT', w.product('X-Burger'), burgerLines),
    );
    And('duas telas abertas mostram a ficha de "X-Burger"', async () => {
      shown = (
        await w.services.recipes.getRecipe(w.ctx('carla'), {
          kind: 'PRODUCT',
          id: w.product('X-Burger'),
        })
      ).version;
    });
    When('a primeira tela salva "160" de "Carne moída"', () =>
      save('carla', 'PRODUCT', w.product('X-Burger'), [['Carne moída', '160']], shown),
    );
    And('a segunda tela tenta salvar "170" de "Carne moída"', () =>
      w.attempt(() =>
        save('carla', 'PRODUCT', w.product('X-Burger'), [['Carne moída', '170']], shown),
      ),
    );
    Then('a ação é recusada com o código "CONCURRENT_MODIFICATION"', () => {
      w.expectFailure('CONCURRENT_MODIFICATION');
    });
  });

  Scenario('Cozinha vê a ficha mas não altera', ({ Given, When, Then }) => {
    Given('"teo" é da cozinha na loja "Centro"', () =>
      w.addPerson('teo', 'COZINHA', { store: 'Centro' }),
    );
    When(
      '"teo" tenta salvar a ficha de "X-Burger" com "1" de "Pão de hambúrguer" e "150" de "Carne moída"',
      () => w.attempt(() => save('teo', 'PRODUCT', w.product('X-Burger'), burgerLines)),
    );
    Then('a ação é negada por falta de permissão', async () => {
      w.expectFailure('FORBIDDEN');
      await expect(w.services.recipes.listRecipes(w.ctx('teo'))).resolves.toBeDefined();
    });
  });
});
