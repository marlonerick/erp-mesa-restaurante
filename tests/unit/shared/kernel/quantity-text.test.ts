import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  formatQuantityInput,
  formatQuantityText,
  parseQuantityText,
  Quantity,
} from '@/shared/kernel';

describe('quantidade digitada (RN-INV-04)', () => {
  it.each([
    ['1,5', 1500],
    ['1.5', 1500],
    ['0,250', 250],
    ['12', 12000],
    ['  3 ', 3000],
    ['0', 0],
    ['1.500', 1500],
  ])('%j → %i milésimos', (text, thousandths) => {
    expect(parseQuantityText(text)).toBe(thousandths);
  });

  it.each(['', '-1', '1,2345', 'abc', '1,2,3', '1 kg', ',5'])('recusa %j', (text) => {
    expect(parseQuantityText(text)).toBeNull();
  });

  it.each([
    [1500, '1,5'],
    [2000, '2'],
    [250, '0,25'],
    [-3000, '-3'],
    [1_234_500, '1.234,5'],
  ])('%i → %j', (thousandths, text) => {
    expect(formatQuantityText(thousandths)).toBe(text);
  });

  it('o valor que preenche um CAMPO é lido de volta exatamente igual', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99_999_999_999 }), (thousandths) => {
        expect(parseQuantityText(formatQuantityInput(thousandths))).toBe(thousandths);
      }),
    );
  });

  it('regressão: mínimo de 1000 g no campo NÃO vira 1 g ao salvar sem mexer', () => {
    // Bug visto nos prints: o campo mostrava "1.000" (texto de leitura) e o ponto é decimal
    expect(formatQuantityInput(1_000_000)).toBe('1000');
    expect(parseQuantityText(formatQuantityInput(1_000_000))).toBe(1_000_000);
    expect(parseQuantityText(formatQuantityText(1_000_000))).toBe(1000);
  });
});

describe('Quantity.times (ficha × quantidade vendida)', () => {
  it('multiplica em milésimos com arredondamento half-up', () => {
    const line = Quantity.of('150', 'g');
    expect(line.times(2000).toDecimalString()).toBe('300.000');
    expect(line.times(1500).toDecimalString()).toBe('225.000');
    expect(Quantity.of('0.333', 'g').times(1500).toDecimalString()).toBe('0.500');
    expect(Quantity.of('0.001', 'g').times(499).toDecimalString()).toBe('0.000');
    expect(Quantity.of('0.001', 'g').times(500).toDecimalString()).toBe('0.001');
  });
});
