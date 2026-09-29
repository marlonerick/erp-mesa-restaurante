import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  categoryName,
  moveInOrder,
  normalizeDescription,
  normalizeSku,
  parseModifierPriceText,
  parsePriceText,
  productName,
  selectionIsSatisfiable,
  validateModifierGroupIds,
  validateSelectionLimits,
} from '@/modules/catalog/domain/rules';
import { type Id, newId } from '@/shared/kernel';

const code = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe('nomes (RN-CAT-02, RN-CAT-04)', () => {
  it('tira espaços sobrando', () => {
    expect(productName('  X-Burger   da   casa ')).toBe('X-Burger da casa');
  });

  it.each([
    ['X', 'categoria curta'],
    ['a'.repeat(61), 'categoria longa'],
  ])('recusa %j (%s)', (name) => {
    expect(code(() => categoryName(name))).toBe('INVALID_NAME');
  });

  it('produto aceita até 80 caracteres', () => {
    expect(productName('a'.repeat(80))).toHaveLength(80);
    expect(code(() => productName('a'.repeat(81)))).toBe('INVALID_NAME');
  });
});

describe('código SKU (RN-CAT-04, E4-4)', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['xb-01', 'XB-01'],
    ['coca_lata.350', 'COCA_LATA.350'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeSku(input)).toBe(expected);
  });

  it('null continua null', () => {
    expect(normalizeSku(null)).toBeNull();
  });

  it.each(['com espaço', 'ação', 'a'.repeat(31), 'x/y'])('recusa %j', (input) => {
    expect(code(() => normalizeSku(input))).toBe('INVALID_SKU');
  });
});

describe('descrição', () => {
  it('vazia vira null e longa é recusada', () => {
    expect(normalizeDescription('  ')).toBeNull();
    expect(normalizeDescription(' Pão, carne e queijo ')).toBe('Pão, carne e queijo');
    expect(code(() => normalizeDescription('a'.repeat(301)))).toBe('INVALID_DESCRIPTION');
  });
});

describe('preço (RN-CAT-07, RN-CAT-12)', () => {
  it.each([
    ['0', 0],
    ['32,50', 3250],
    ['99.999,99', 9_999_999],
  ])('preço %j → %i', (text, cents) => {
    expect(parsePriceText(text)).toBe(cents);
  });

  it.each(['100.000,00', '-1', 'grátis', '', '1,999'])('preço %j é recusado', (text) => {
    expect(code(() => parsePriceText(text))).toBe('INVALID_PRICE');
  });

  it('adicional: vazio = R$ 0,00; limite R$ 9.999,99', () => {
    expect(parseModifierPriceText('')).toBe(0);
    expect(parseModifierPriceText('5')).toBe(500);
    expect(parseModifierPriceText('9.999,99')).toBe(999_999);
    expect(code(() => parseModifierPriceText('10.000'))).toBe('INVALID_MODIFIER_PRICE');
  });
});

describe('limites de escolha do grupo (RN-CAT-11)', () => {
  it.each([
    [0, 1],
    [1, 1],
    [0, 10],
    [10, 10],
  ])('aceita mínimo %i e máximo %i', (min, max) => {
    expect(validateSelectionLimits(min, max)).toEqual({ minSelect: min, maxSelect: max });
  });

  it.each([
    [2, 1],
    [0, 0],
    [0, 11],
    [-1, 1],
    [0.5, 1],
  ])('recusa mínimo %d e máximo %d', (min, max) => {
    expect(code(() => validateSelectionLimits(min, max))).toBe('INVALID_SELECTION_LIMITS');
  });

  it('avisa quando o mínimo é maior que as opções ativas', () => {
    expect(selectionIsSatisfiable(1, 3)).toBe(true);
    expect(selectionIsSatisfiable(2, 1)).toBe(false);
    expect(selectionIsSatisfiable(0, 0)).toBe(true);
  });
});

describe('grupos do produto (RN-CAT-06)', () => {
  it('tira repetidos e aceita até 10', () => {
    const [a, b] = [newId(), newId()];
    expect(validateModifierGroupIds([a, b, a])).toEqual([a, b]);
    const eleven = Array.from({ length: 11 }, () => newId());
    expect(code(() => validateModifierGroupIds(eleven))).toBe('TOO_MANY_MODIFIER_GROUPS');
  });
});

describe('subir/descer na ordem (RN-CAT-02)', () => {
  it('troca com o vizinho e não sai dos limites', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'c', 'UP')).toEqual(['a', 'c', 'b']);
    expect(moveInOrder(['a', 'b', 'c'], 'a', 'DOWN')).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'a', 'UP')).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'c', 'DOWN')).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a', 'b'], 'x', 'UP')).toBeNull();
  });

  it('nunca perde nem duplica um item', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string(), { minLength: 1, maxLength: 30 }),
        fc.nat(),
        fc.constantFrom('UP' as const, 'DOWN' as const),
        (items, pick, direction) => {
          const item = items[pick % items.length] ?? '';
          const moved = moveInOrder(items, item, direction) ?? [];
          expect([...moved].sort()).toEqual([...items].sort());
        },
      ),
    );
  });

  it('ids de verdade também', () => {
    const [first, second]: Id[] = [newId(), newId()];
    expect(moveInOrder([first, second], second, 'UP')).toEqual([second, first]);
  });
});
