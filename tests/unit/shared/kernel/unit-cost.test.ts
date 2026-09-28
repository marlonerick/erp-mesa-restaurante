import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, Money, Quantity, totalCost, UnitCost } from '@/shared/kernel';

describe('UnitCost (custo por unidade base, precisão de micro-real)', () => {
  it('guarda frações de centavo', () => {
    // Queijo a R$ 45,90/kg = R$ 0,0459 por grama
    const cost = UnitCost.fromDecimalString('0.0459');
    expect(cost.micros).toBe(45_900n);
    expect(cost.toDecimalString()).toBe('0.045900');
  });

  it.each(['', '-0.1', '1,5', '0.1234567', 'abc', '1234567890123.0'])(
    'rejeita formato inválido (%s)',
    (value) => {
      expect(() => UnitCost.fromDecimalString(value)).toThrow(DomainError);
    },
  );

  it('rejeita micros negativos', () => {
    expect(() => UnitCost.fromMicros(-1n)).toThrow(DomainError);
  });

  it('ida e volta texto ↔ custo é estável (propriedade)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 999_999_999_999_999_999n }), (micros) => {
        const cost = UnitCost.fromMicros(micros);
        expect(UnitCost.fromDecimalString(cost.toDecimalString()).micros).toBe(micros);
      }),
    );
  });

  it('calcula custo unitário a partir de uma compra', () => {
    // Pagou R$ 45,90 por 1000 g → R$ 0,0459/g
    const cost = UnitCost.fromTotal(Money.fromCents(4590), Quantity.of('1000', 'g'));
    expect(cost.toDecimalString()).toBe('0.045900');
  });

  it('arredonda o custo unitário da compra half-up no micro-real', () => {
    // R$ 10,00 por 3 un = 3,333333(3) → 3.333333
    expect(
      UnitCost.fromTotal(Money.fromCents(1000), Quantity.of('3', 'un')).toDecimalString(),
    ).toBe('3.333333');
    // R$ 20,00 por 3 un = 6,666666(6) → 6.666667
    expect(
      UnitCost.fromTotal(Money.fromCents(2000), Quantity.of('3', 'un')).toDecimalString(),
    ).toBe('6.666667');
  });

  it('recusa compra com quantidade zero ou negativa, ou valor negativo', () => {
    expect(() => UnitCost.fromTotal(Money.fromCents(100), Quantity.zero('g'))).toThrow(DomainError);
    expect(() => UnitCost.fromTotal(Money.fromCents(100), Quantity.of('-1', 'g'))).toThrow(
      DomainError,
    );
    expect(() => UnitCost.fromTotal(Money.fromCents(-1), Quantity.of('1', 'g'))).toThrow(
      DomainError,
    );
  });
});

describe('totalCost (custo teórico da ficha técnica)', () => {
  it('soma com precisão total e arredonda uma única vez', () => {
    // 150 g × R$ 0,0459 = R$ 6,885 ; 0,5 un × R$ 0,333333 = R$ 0,1666665
    // soma exata = R$ 7,0516665 → R$ 7,05
    const cost = totalCost([
      { quantity: Quantity.of('150', 'g'), unitCost: UnitCost.fromDecimalString('0.0459') },
      { quantity: Quantity.of('0.5', 'un'), unitCost: UnitCost.fromDecimalString('0.333333') },
    ]);
    expect(cost.cents).toBe(705);
  });

  it('meio centavo arredonda para cima', () => {
    // 1 g × R$ 0,005 = 0,5 centavo → 1 centavo
    expect(
      totalCost([
        { quantity: Quantity.of('1', 'g'), unitCost: UnitCost.fromDecimalString('0.005') },
      ]).cents,
    ).toBe(1);
  });

  it('lista vazia custa zero', () => {
    expect(totalCost([]).isZero()).toBe(true);
  });

  it('com quantidades negativas (estorno) arredonda para longe de zero', () => {
    expect(
      totalCost([
        { quantity: Quantity.of('-1', 'g'), unitCost: UnitCost.fromDecimalString('0.005') },
      ]).cents,
    ).toBe(-1);
  });
});
