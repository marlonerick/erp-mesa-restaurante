import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, Quantity, toBaseQuantity } from '@/shared/kernel';

describe('Quantity', () => {
  it('converte texto decimal em milésimos', () => {
    expect(Quantity.of('0.350', 'g').thousandths).toBe(350);
    expect(Quantity.of('12', 'un').thousandths).toBe(12_000);
    expect(Quantity.of('-1.5', 'ml').thousandths).toBe(-1_500);
  });

  it.each(['', 'abc', '1,5', '1.2345', '1e3', '.5', '5.', '--1'])(
    'rejeita formato inválido (%s)',
    (value) => {
      expect(() => Quantity.of(value, 'g')).toThrow(DomainError);
    },
  );

  it('rejeita valores acima de DECIMAL(14,3)', () => {
    expect(() => Quantity.of('100000000000.000', 'g')).toThrow(DomainError);
    expect(Quantity.of('99999999999.999', 'g').thousandths).toBe(99_999_999_999_999);
  });

  it('formata com três casas decimais', () => {
    expect(Quantity.fromThousandths(350, 'g').toDecimalString()).toBe('0.350');
    expect(Quantity.fromThousandths(-1_500, 'ml').toDecimalString()).toBe('-1.500');
    expect(Quantity.fromThousandths(0, 'un').toDecimalString()).toBe('0.000');
  });

  it('ida e volta texto ↔ quantidade é estável (propriedade)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -99_999_999_999_999, max: 99_999_999_999_999 }), (value) => {
        const quantity = Quantity.fromThousandths(value, 'g');
        expect(Quantity.of(quantity.toDecimalString(), 'g').equals(quantity)).toBe(true);
      }),
    );
  });

  it('soma, subtrai, nega e compara na mesma unidade', () => {
    const a = Quantity.of('1.250', 'g');
    const b = Quantity.of('0.250', 'g');

    expect(a.add(b).toDecimalString()).toBe('1.500');
    expect(b.subtract(a).toDecimalString()).toBe('-1.000');
    expect(a.negate().isNegative()).toBe(true);
    expect(a.compareTo(b)).toBe(1);
    expect(b.compareTo(a)).toBe(-1);
    expect(a.compareTo(a)).toBe(0);
    expect(Quantity.zero('un').isZero()).toBe(true);
    expect(b.isPositive()).toBe(true);
  });

  it('recusa operar unidades diferentes', () => {
    expect(() => Quantity.of('1', 'g').add(Quantity.of('1', 'ml'))).toThrow(
      expect.objectContaining({ code: 'UNIT_MISMATCH' }),
    );
    expect(Quantity.of('1', 'g').equals(Quantity.of('1', 'ml'))).toBe(false);
  });

  it('serializa como texto decimal e unidade', () => {
    expect(JSON.stringify(Quantity.of('0.5', 'g'))).toBe('{"value":"0.500","unit":"g"}');
  });
});

describe('toBaseQuantity (conversões kg→g e L→ml)', () => {
  it.each([
    ['1.5', 'kg', '1500.000', 'g'],
    ['0.001', 'kg', '1.000', 'g'],
    ['2', 'L', '2000.000', 'ml'],
    ['350', 'ml', '350.000', 'ml'],
    ['250', 'g', '250.000', 'g'],
    ['12', 'un', '12.000', 'un'],
  ] as const)('%s %s = %s %s', (value, unit, expected, base) => {
    const quantity = toBaseQuantity(value, unit);
    expect(quantity.toDecimalString()).toBe(expected);
    expect(quantity.unit).toBe(base);
  });

  it('rejeita unidade desconhecida', () => {
    // @ts-expect-error — unidade inválida de propósito para testar a validação em tempo de execução
    expect(() => toBaseQuantity('1', 'lb')).toThrow(DomainError);
  });
});
