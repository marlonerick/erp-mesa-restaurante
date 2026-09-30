import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../support/database';
import { floorWorld } from '../orders/floor-world';

// Regras de borda das mesas: isolamento do cadastro (CA-TAB-05, achado I-3 da revisão), número de
// mesa em uso (sugestão S-5) e limite de mesas por conta (achado I-1).

const { db } = useTestDatabase();
const w = floorWorld(db);

async function codeOf(work: Promise<unknown>) {
  try {
    await work;
    return 'ok';
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

beforeEach(async () => {
  await w.first('carla', 'GERENTE');
  await w.personAt('pedro', 'GERENTE', 'Praia');
  await w.createTable('1', 'carla');
});

describe('isolamento do cadastro de mesas (RN-TAB-01, CA-TAB-05)', () => {
  it('gerente da Praia não lê, não altera e não lista mesa do Centro', async () => {
    const praia = w.ctx('pedro');
    const table = await w.services.tables.getTable(w.ctx('carla'), w.table('1'));
    expect(await codeOf(w.services.tables.getTable(praia, table.id))).toBe('TABLE_NOT_FOUND');
    expect(
      await codeOf(
        w.services.tables.updateTable(praia, {
          tableId: table.id,
          version: table.version,
          number: 'X',
          area: null,
          seats: 2,
          active: true,
        }),
      ),
    ).toBe('TABLE_NOT_FOUND');
    expect(await w.services.tables.listTables(praia, { includeInactive: true })).toEqual([]);
    // Mesmo número em outra loja é permitido (único por loja)
    await w.services.tables.createTable(praia, { number: '1', seats: 4 });
    expect(await w.services.tables.listTables(praia)).toHaveLength(1);
  });
});

describe('cadastro de mesa em uso (RN-TAB-03, sugestão S-5)', () => {
  it('não troca o número de mesa ocupada (o rótulo da conta ficaria velho)', async () => {
    await w.person('joão', 'GARCOM');
    await w.open('joão', '1');
    const table = await w.services.tables.getTable(w.ctx('carla'), w.table('1'));
    const update = (number: string, seats: number) =>
      w.services.tables.updateTable(w.ctx('carla'), {
        tableId: table.id,
        version: table.version,
        number,
        area: table.area,
        seats,
        active: true,
      });
    expect(await codeOf(update('1A', table.seats))).toBe('TABLE_IN_USE');
    // Lugares podem mudar com a mesa ocupada
    expect(await codeOf(update('1', 8))).toBe('ok');
  });
});

describe('limite de mesas por conta (achado I-1)', () => {
  it('junta até 12 mesas; a 13ª é recusada e o rótulo cabe no banco', async () => {
    await w.person('joão', 'GARCOM');
    const numbers = Array.from({ length: 12 }, (_, index) => `Varanda ${String(index + 2)}`);
    for (const number of [...numbers, 'Extra 13']) await w.createTable(number, 'carla');
    await w.open('joão', '1');
    for (const number of numbers.slice(0, 11)) await w.join('joão', number, '1');
    const detail = await w.order('1');
    expect(detail.tables).toHaveLength(12);
    expect(detail.label.length).toBeGreaterThan(60);
    expect(await codeOf(w.join('joão', 'Extra 13', '1'))).toBe('ORDER_TABLE_LIMIT');
  });
});
