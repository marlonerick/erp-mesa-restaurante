import { describe, expect, it } from 'vitest';
import {
  compareTables,
  tableArea,
  tableNumber,
  tableSeats,
  tablesLabel,
} from '@/modules/tables/domain/rules';

const code = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe('cadastro da mesa (RN-TAB-02)', () => {
  it('aceita números e nomes curtos, sem espaços sobrando', () => {
    expect(tableNumber(' 10 ')).toBe('10');
    expect(tableNumber('V1')).toBe('V1');
    expect(tableNumber('Varanda  2')).toBe('Varanda 2');
    expect(tableNumber('A-3')).toBe('A-3');
  });

  it.each(['', '   ', '12345678901', '10!', '-1', 'mesa_1'])('recusa "%s"', (value) => {
    expect(code(() => tableNumber(value))).toBe('INVALID_TABLE_NUMBER');
  });

  it('área é opcional e tem até 40 caracteres', () => {
    expect(tableArea('')).toBeNull();
    expect(tableArea(null)).toBeNull();
    expect(tableArea(' Varanda ')).toBe('Varanda');
    expect(code(() => tableArea('x'.repeat(41)))).toBe('INVALID_TABLE_AREA');
  });

  it('lugares de 1 a 99', () => {
    expect(tableSeats(1)).toBe(1);
    expect(tableSeats(99)).toBe(99);
    for (const value of [0, 100, 2.5, Number.NaN]) {
      expect(code(() => tableSeats(value))).toBe('INVALID_SEATS');
    }
  });
});

describe('ordem do mapa (RN-TAB-07)', () => {
  it('ordena por área e número natural, sem área por último', () => {
    const tables = [
      { area: null, number: '1' },
      { area: 'Varanda', number: '10' },
      { area: 'Salão', number: '10' },
      { area: 'Salão', number: '2' },
      { area: 'Varanda', number: 'V2' },
    ];
    expect(tables.sort(compareTables).map((item) => `${item.area ?? '-'}/${item.number}`)).toEqual([
      'Salão/2',
      'Salão/10',
      'Varanda/10',
      'Varanda/V2',
      '-/1',
    ]);
  });

  it('rótulo das mesas juntadas em ordem natural', () => {
    expect(tablesLabel(['11', '2', '10'])).toBe('2 + 10 + 11');
    expect(tablesLabel(['7'])).toBe('7');
  });
});
