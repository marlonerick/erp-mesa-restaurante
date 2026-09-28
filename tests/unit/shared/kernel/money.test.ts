import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, Money, Percentage, Quantity } from '@/shared/kernel';

const cents = (value: number) => Money.fromCents(value);
const safeCents = fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 });

describe('Money', () => {
  describe('criação', () => {
    it('guarda o valor em centavos inteiros', () => {
      expect(cents(1234).cents).toBe(1234);
      expect(Money.zero().cents).toBe(0);
    });

    it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
      'rejeita centavos não inteiros ou inseguros (%s)',
      (value) => {
        expect(() => Money.fromCents(value)).toThrow(DomainError);
      },
    );

    it('serializa como centavos em JSON', () => {
      expect(JSON.stringify({ total: cents(990) })).toBe('{"total":990}');
    });

    it('formata como decimal com duas casas', () => {
      expect(cents(123456).toDecimalString()).toBe('1234.56');
      expect(cents(5).toDecimalString()).toBe('0.05');
      expect(cents(-150).toDecimalString()).toBe('-1.50');
    });
  });

  describe('aritmética', () => {
    it('soma, subtrai e nega', () => {
      expect(cents(1000).add(cents(250)).cents).toBe(1250);
      expect(cents(1000).subtract(cents(1250)).cents).toBe(-250);
      expect(cents(300).negate().cents).toBe(-300);
      expect(Money.sum([cents(1), cents(2), cents(3)]).cents).toBe(6);
      expect(Money.sum([]).cents).toBe(0);
    });

    it('compara valores', () => {
      expect(cents(10).equals(cents(10))).toBe(true);
      expect(cents(10).compareTo(cents(20))).toBe(-1);
      expect(cents(20).compareTo(cents(10))).toBe(1);
      expect(cents(10).compareTo(cents(10))).toBe(0);
      expect(cents(0).isZero()).toBe(true);
      expect(cents(-1).isNegative()).toBe(true);
      expect(cents(1).isPositive()).toBe(true);
    });

    it('soma é comutativa e associativa (propriedade)', () => {
      fc.assert(
        fc.property(safeCents, safeCents, safeCents, (a, b, c) => {
          expect(
            cents(a)
              .add(cents(b))
              .equals(cents(b).add(cents(a))),
          ).toBe(true);
          expect(
            cents(a)
              .add(cents(b))
              .add(cents(c))
              .equals(cents(a).add(cents(b).add(cents(c)))),
          ).toBe(true);
        }),
      );
    });

    it('rejeita resultado fora do intervalo seguro', () => {
      expect(() => cents(Number.MAX_SAFE_INTEGER).add(cents(1))).toThrow(DomainError);
    });
  });

  describe('percentual (arredondamento half-up, ADR-0003)', () => {
    it('calcula a taxa de serviço de 10%', () => {
      expect(cents(10000).percentage(Percentage.fromBasisPoints(1000)).cents).toBe(1000);
    });

    it('arredonda meio centavo para cima', () => {
      // 10% de R$ 0,05 = 0,5 centavo → 1 centavo
      expect(cents(5).percentage(Percentage.fromBasisPoints(1000)).cents).toBe(1);
      // 10% de R$ 0,04 = 0,4 centavo → 0
      expect(cents(4).percentage(Percentage.fromBasisPoints(1000)).cents).toBe(0);
    });

    it('arredonda valores negativos para longe de zero', () => {
      expect(cents(-5).percentage(Percentage.fromBasisPoints(1000)).cents).toBe(-1);
    });

    it('nunca erra mais que meio centavo (propriedade)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000_000 }),
          fc.integer({ min: 0, max: 10_000 }),
          (value, bp) => {
            const result = cents(value).percentage(Percentage.fromBasisPoints(bp)).cents;
            const exact = (value * bp) / 10_000;
            expect(Math.abs(result - exact)).toBeLessThanOrEqual(0.5);
          },
        ),
      );
    });
  });

  describe('multiplicação por quantidade', () => {
    it('calcula preço × quantidade inteira', () => {
      expect(cents(1590).multiplyBy(Quantity.of('3', 'un')).cents).toBe(4770);
    });

    it('calcula preço por kg × peso com arredondamento half-up', () => {
      // R$ 59,90/kg × 0,457 kg = R$ 27,3743 → R$ 27,37
      expect(cents(5990).multiplyBy(Quantity.of('0.457', 'g')).cents).toBe(2737);
      // R$ 0,01 × 0,5 = 0,5 centavo → 1 centavo
      expect(cents(1).multiplyBy(Quantity.of('0.5', 'un')).cents).toBe(1);
    });
  });

  describe('divisão da conta em partes (allocate)', () => {
    it('divide R$ 100,00 em 3 partes, sobra para as primeiras', () => {
      expect(
        cents(10000)
          .allocate(3)
          .map((m) => m.cents),
      ).toEqual([3334, 3333, 3333]);
    });

    it('divide valores negativos preservando a soma', () => {
      expect(
        cents(-100)
          .allocate(3)
          .map((m) => m.cents),
      ).toEqual([-34, -33, -33]);
    });

    it('rejeita número de partes inválido', () => {
      expect(() => cents(100).allocate(0)).toThrow(DomainError);
      expect(() => cents(100).allocate(1.5)).toThrow(DomainError);
    });

    it('soma das partes é sempre o total e diferença máxima de 1 centavo (propriedade)', () => {
      fc.assert(
        fc.property(safeCents, fc.integer({ min: 1, max: 50 }), (value, parts) => {
          const pieces = cents(value)
            .allocate(parts)
            .map((m) => m.cents);
          expect(pieces).toHaveLength(parts);
          expect(pieces.reduce((a, b) => a + b, 0)).toBe(value);
          expect(Math.max(...pieces) - Math.min(...pieces)).toBeLessThanOrEqual(1);
        }),
      );
    });
  });
});

describe('Percentage', () => {
  it('guarda pontos-base (10% = 1000)', () => {
    expect(Percentage.fromBasisPoints(1000).basisPoints).toBe(1000);
    expect(Percentage.zero().basisPoints).toBe(0);
  });

  it.each([-1, 10_001, 1.5])('rejeita pontos-base inválidos (%s)', (bp) => {
    expect(() => Percentage.fromBasisPoints(bp)).toThrow(DomainError);
  });

  it('compara percentuais', () => {
    expect(Percentage.fromBasisPoints(1500).isGreaterThan(Percentage.fromBasisPoints(1000))).toBe(
      true,
    );
    expect(Percentage.fromBasisPoints(1000).isGreaterThan(Percentage.fromBasisPoints(1000))).toBe(
      false,
    );
  });
});
