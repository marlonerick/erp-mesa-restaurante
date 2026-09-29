import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatMoneyText, parseMoneyText } from '@/shared/kernel';

describe('valor em reais digitado (RN-CAT-08)', () => {
  it.each([
    ['32', 3200],
    ['32,5', 3250],
    ['32,50', 3250],
    ['0,05', 5],
    ['0', 0],
    ['1.234,50', 123450],
    ['R$ 32,50', 3250],
    ['r$32', 3200],
    ['  12,90  ', 1290],
    // Ponto seguido de 1 ou 2 dígitos = centavos (teclado numérico)
    ['32.50', 3250],
    ['32.5', 3250],
    // Ponto seguido de 3 dígitos = milhar
    ['1.234', 123400],
    ['12.345.678', 1234567800],
    ['32,', 3200],
  ])('%j → %i centavos', (text, cents) => {
    expect(parseMoneyText(text)).toBe(cents);
  });

  it.each([
    '',
    'abc',
    '-5',
    '32,505',
    '3,2,1',
    '1.23.4',
    '12.34,5.6',
    ',50',
    '1e3',
    '12 34',
    '1234567890',
  ])('recusa %j', (text) => {
    expect(parseMoneyText(text)).toBeNull();
  });

  it.each([
    [0, '0,00'],
    [5, '0,05'],
    [3250, '32,50'],
    [123450, '1.234,50'],
    [9_999_999, '99.999,99'],
    [-1290, '-12,90'],
  ])('%i centavos → %j', (cents, text) => {
    expect(formatMoneyText(cents)).toBe(text);
  });

  it('o que a tela mostra é lido de volta sem perder um centavo', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99_999_999_99 }), (cents) => {
        expect(parseMoneyText(formatMoneyText(cents))).toBe(cents);
      }),
    );
  });
});
