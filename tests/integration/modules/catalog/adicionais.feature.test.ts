import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { catalogWorld, cents } from './catalog-world';

const feature = await loadFeature('tests/features/catalog/adicionais.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  const w = catalogWorld(db);

  async function addOption(group: string, name: string, price = '') {
    await w.catalog.createModifier(w.ctx('carla'), {
      groupId: w.group(group),
      name,
      priceDeltaCents: price === '' ? 0 : cents(price),
    });
  }

  Scenario(
    'Grupo "Ponto da carne" aparece no produto do cardápio',
    ({ Given, And, When, Then }) => {
      Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
      And('existe a categoria "Lanches"', () => w.createCategory('Lanches'));
      And('"carla" cadastrou o grupo "Ponto da carne" com escolha mínima 1 e máxima 1', () =>
        w.createGroup('carla', 'Ponto da carne', 1, 1),
      );
      And(
        'o grupo "Ponto da carne" tem as opções "Mal passado", "Ao ponto" e "Bem passado"',
        async () => {
          for (const name of ['Mal passado', 'Ao ponto', 'Bem passado']) {
            await addOption('Ponto da carne', name);
          }
        },
      );
      When('"carla" cadastra o produto "X-Burger" em "Lanches" com o grupo "Ponto da carne"', () =>
        w.createProduct('carla', {
          name: 'X-Burger',
          category: 'Lanches',
          price: '32,00',
          groups: ['Ponto da carne'],
        }),
      );
      Then('no cardápio o "X-Burger" pede "Ponto da carne" com 3 opções', async () => {
        const burger = (await w.menu('Centro')).find((item) => item.name === 'X-Burger');
        expect(burger?.modifierGroups).toEqual([
          expect.objectContaining({ name: 'Ponto da carne', minSelect: 1, maxSelect: 1 }),
        ]);
        // Ordem de cadastro das opções
        expect(burger?.modifierGroups[0]?.options.map((option) => option.name)).toEqual([
          'Mal passado',
          'Ao ponto',
          'Bem passado',
        ]);
      });
    },
  );

  Scenario('Adicional tem o mesmo preço em todas as lojas', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
    And('"carla" cadastrou o grupo "Extras" com escolha mínima 0 e máxima 3', () =>
      w.createGroup('carla', 'Extras', 0, 3),
    );
    When('"carla" cadastra a opção "Bacon" custando "5,00" no grupo "Extras"', () =>
      addOption('Extras', 'Bacon', '5,00'),
    );
    Then('a opção "Bacon" do grupo "Extras" custa 500 centavos', async () => {
      const group = await w.catalog.getModifierGroup(w.ctx('carla'), w.group('Extras'));
      expect(group.modifiers).toEqual([
        expect.objectContaining({ name: 'Bacon', priceDeltaCents: 500 }),
      ]);
    });
  });

  ScenarioOutline(
    'Limites de escolha inválidos são recusados',
    ({ Given, When, Then }, variables) => {
      Given('que "carla" é gerente na loja "Centro"', () => w.manager('carla'));
      When(
        '"carla" tenta cadastrar o grupo "Molhos" com escolha mínima <minimo> e máxima <maximo>',
        () =>
          w.attempt(() =>
            w.createGroup('carla', 'Molhos', Number(variables.minimo), Number(variables.maximo)),
          ),
      );
      Then('a ação é recusada com o código "INVALID_SELECTION_LIMITS"', () => {
        w.expectFailure('INVALID_SELECTION_LIMITS');
      });
    },
  );
});
