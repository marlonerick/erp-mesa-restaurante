import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  expandConsumption,
  marginTenths,
  sameLines,
  validateLines,
} from '@/modules/recipes/domain/rules';
import { type Id, newId } from '@/shared/kernel';

const code = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe('linhas da ficha (RN-REC-02)', () => {
  it('converte a quantidade digitada e recusa repetido, zero e linhas demais', () => {
    const [pao, carne] = [newId(), newId()];
    expect(
      validateLines([
        { ingredientId: pao, quantity: '1' },
        { ingredientId: carne, quantity: '150,5' },
      ]),
    ).toEqual([
      { ingredientId: pao, quantity: 1000 },
      { ingredientId: carne, quantity: 150_500 },
    ]);
    expect(
      code(() =>
        validateLines([
          { ingredientId: pao, quantity: '1' },
          { ingredientId: pao, quantity: '2' },
        ]),
      ),
    ).toBe('DUPLICATE_INGREDIENT');
    expect(code(() => validateLines([{ ingredientId: pao, quantity: '0' }]))).toBe(
      'INVALID_QUANTITY',
    );
    const many = Array.from({ length: 31 }, () => ({ ingredientId: newId(), quantity: '1' }));
    expect(code(() => validateLines(many))).toBe('TOO_MANY_LINES');
  });

  it('mesma ficha em outra ordem é igual', () => {
    const [a, b] = [newId(), newId()];
    const one = [
      { ingredientId: a, quantity: 1000 },
      { ingredientId: b, quantity: 150_000 },
    ];
    expect(sameLines(one, [...one].reverse())).toBe(true);
    expect(sameLines(one, [{ ingredientId: a, quantity: 1000 }])).toBe(false);
  });
});

describe('margem (RN-REC-04)', () => {
  it.each([
    [3200, 680, 788],
    [1000, 1000, 0],
    [1000, 1500, -500],
    [null, 680, null],
    [0, 10, null],
  ])('preço %s e custo %i → %s décimos de %', (price, cost, expected) => {
    expect(marginTenths(price, cost)).toBe(expected);
  });
});

describe('consumo do item vendido (RN-REC-06)', () => {
  const [pao, carne, bacon, item] = [newId(), newId(), newId(), newId()];

  it('ficha × quantidade + adicional × quantidade do adicional × quantidade do item', () => {
    expect(
      expandConsumption([
        {
          originId: item,
          quantity: 2000,
          productLines: [
            { ingredientId: pao, quantity: 1000 },
            { ingredientId: carne, quantity: 150_000 },
          ],
          modifiers: [{ quantity: 1000, lines: [{ ingredientId: bacon, quantity: 30_000 }] }],
        },
      ]),
    ).toEqual([
      { originId: item, ingredientId: pao, quantity: 2000 },
      { originId: item, ingredientId: carne, quantity: 300_000 },
      { originId: item, ingredientId: bacon, quantity: 60_000 },
    ]);
  });

  it('soma o mesmo insumo do produto e do adicional', () => {
    expect(
      expandConsumption([
        {
          originId: item,
          quantity: 1000,
          productLines: [{ ingredientId: carne, quantity: 150_000 }],
          modifiers: [{ quantity: 2000, lines: [{ ingredientId: carne, quantity: 50_000 }] }],
        },
      ]),
    ).toEqual([{ originId: item, ingredientId: carne, quantity: 250_000 }]);
  });

  it('item sem ficha não consome nada', () => {
    expect(
      expandConsumption([{ originId: item, quantity: 3000, productLines: [], modifiers: [] }]),
    ).toEqual([]);
  });

  it('é linear na quantidade (sem perder milésimos em quantidades inteiras)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 50 }),
        (perUnit, units) => {
          const ingredientId: Id = carne;
          const [line] = expandConsumption([
            {
              originId: item,
              quantity: units * 1000,
              productLines: [{ ingredientId, quantity: perUnit }],
              modifiers: [],
            },
          ]);
          expect(line?.quantity).toBe(perUnit * units);
        },
      ),
    );
  });
});
