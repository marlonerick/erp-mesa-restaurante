import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { floorWorld } from '../orders/floor-world';

const feature = await loadFeature('tests/features/tables/mesas.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = floorWorld(db);

  Background(({ Given, And }) => {
    Given('que "carla" é gerente na loja "Centro"', () => w.first('carla', 'GERENTE'));
    And('"joão" é garçom na loja "Centro"', () => w.person('joão', 'GARCOM'));
  });

  const status = (table: string, expected: string) => async () => {
    expect(await w.floorStatus(table)).toBe(expected);
  };

  Scenario('Gerente cadastra uma mesa', ({ When, Then, And }) => {
    When('"carla" cadastra a mesa "10" na área "Varanda" com 6 lugares', () =>
      w.createTable('10', 'carla', { area: 'Varanda', seats: 6 }),
    );
    Then('o mapa do "Centro" mostra a mesa "10" como "LIVRE"', status('10', 'LIVRE'));
    And('a auditoria registra "TABLE_CREATED" feito por "carla"', () =>
      w.expectAudit('TABLE_CREATED', 'carla'),
    );
  });

  Scenario('Número repetido na mesma loja é recusado', ({ Given, When, Then }) => {
    Given('"carla" cadastrou a mesa "10"', () => w.createTable('10', 'carla'));
    When('"carla" tenta cadastrar a mesa "10"', () =>
      w.attempt(() => w.createTable('10', 'carla')),
    );
    Then('a ação é recusada com o código "TABLE_NUMBER_TAKEN"', () => {
      w.expectFailure('TABLE_NUMBER_TAKEN');
    });
  });

  Scenario('Garçom não cadastra mesa', ({ When, Then }) => {
    When('"joão" tenta cadastrar a mesa "20"', () => w.attempt(() => w.createTable('20', 'joão')));
    Then('a ação é recusada com o código "FORBIDDEN"', () => {
      w.expectFailure('FORBIDDEN');
    });
  });

  Scenario('Mesa ocupada não pode ser desativada', ({ Given, And, When, Then }) => {
    Given('"carla" cadastrou a mesa "10"', () => w.createTable('10', 'carla'));
    And('"joão" abriu a mesa "10"', () => w.open('joão', '10'));
    When('"carla" tenta desativar a mesa "10"', () =>
      w.attempt(async () => {
        const table = await w.services.tables.getTable(w.ctx('carla'), w.table('10'));
        await w.services.tables.updateTable(w.ctx('carla'), {
          tableId: table.id,
          version: table.version,
          number: table.number,
          area: table.area,
          seats: table.seats,
          active: false,
        });
      }),
    );
    Then('a ação é recusada com o código "TABLE_IN_USE"', () => {
      w.expectFailure('TABLE_IN_USE');
    });
  });

  Scenario('Garçom libera a mesa depois da limpeza', ({ Given, And, When, Then }) => {
    Given('"carla" cadastrou a mesa "10"', () => w.createTable('10', 'carla'));
    And('a mesa "10" está em "LIMPEZA"', () => w.forceTableStatus('10', 'LIMPEZA'));
    When('"joão" libera a mesa "10"', () =>
      w.services.tables.releaseTable(w.ctx('joão'), { tableId: w.table('10') }),
    );
    Then('o mapa do "Centro" mostra a mesa "10" como "LIVRE"', status('10', 'LIVRE'));
  });
});
