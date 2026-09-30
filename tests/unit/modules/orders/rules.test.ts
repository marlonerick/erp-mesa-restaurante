import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cancelReason,
  cancelStockEffect,
  chooseModifiers,
  counterLabel,
  guestsCount,
  itemNotes,
  itemQuantity,
  lineTotal,
  type ModifierGroupRule,
  ORDER_ITEM_STATUSES,
  optionalReason,
  subtotal,
} from '@/modules/orders/domain/rules';
import { newId } from '@/shared/kernel';

const code = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe('dados da conta e do item', () => {
  it('nome do balcão de 2 a 40 caracteres (Q-04)', () => {
    expect(counterLabel('  Maria  Silva ')).toBe('Maria Silva');
    expect(code(() => counterLabel('M'))).toBe('INVALID_COUNTER_LABEL');
    expect(code(() => counterLabel('x'.repeat(41)))).toBe('INVALID_COUNTER_LABEL');
  });

  it('pessoas opcional, de 1 a 99 (E6-7)', () => {
    expect(guestsCount(null)).toBeNull();
    expect(guestsCount(undefined)).toBeNull();
    expect(guestsCount(4)).toBe(4);
    expect(code(() => guestsCount(0))).toBe('INVALID_GUESTS');
    expect(code(() => guestsCount(100))).toBe('INVALID_GUESTS');
  });

  it('quantidade inteira de 1 a 99 (E6-3)', () => {
    expect(itemQuantity(1)).toBe(1);
    expect(itemQuantity(99)).toBe(99);
    for (const value of [0, 100, 1.5, -1, Number.NaN]) {
      expect(code(() => itemQuantity(value))).toBe('INVALID_ITEM_QUANTITY');
    }
  });

  it('observação opcional até 140 caracteres', () => {
    expect(itemNotes('')).toBeNull();
    expect(itemNotes(' sem  cebola ')).toBe('sem cebola');
    expect(code(() => itemNotes('x'.repeat(141)))).toBe('INVALID_ITEM_NOTES');
  });

  it('motivo do cancelamento de 3 a 200 caracteres; na conta, opcional', () => {
    expect(cancelReason(' cliente desistiu ')).toBe('cliente desistiu');
    expect(code(() => cancelReason('ok'))).toBe('CANCEL_REASON_REQUIRED');
    expect(code(() => cancelReason(''))).toBe('CANCEL_REASON_REQUIRED');
    expect(optionalReason('')).toBeNull();
    expect(code(() => optionalReason('ab'))).toBe('CANCEL_REASON_REQUIRED');
  });
});

describe('adicionais (RN-ORD-06)', () => {
  const bacon = { id: newId(), name: 'Bacon', priceDeltaCents: 500 };
  const ovo = { id: newId(), name: 'Ovo', priceDeltaCents: 300 };
  const malPassado = { id: newId(), name: 'Mal passado', priceDeltaCents: 0 };
  const aoPonto = { id: newId(), name: 'Ao ponto', priceDeltaCents: 0 };
  const groups: ModifierGroupRule[] = [
    {
      id: newId(),
      name: 'Ponto da carne',
      minSelect: 1,
      maxSelect: 1,
      options: [malPassado, aoPonto],
    },
    { id: newId(), name: 'Extras', minSelect: 0, maxSelect: 2, options: [bacon, ovo] },
  ];

  it('devolve as escolhas na ordem dos grupos, com nome e preço', () => {
    expect(chooseModifiers(groups, [bacon.id, aoPonto.id])).toEqual([
      { modifierId: aoPonto.id, name: 'Ao ponto', priceDeltaCents: 0 },
      { modifierId: bacon.id, name: 'Bacon', priceDeltaCents: 500 },
    ]);
  });

  it('respeita o mínimo e o máximo de cada grupo', () => {
    expect(code(() => chooseModifiers(groups, [bacon.id]))).toBe('INVALID_MODIFIERS');
    expect(code(() => chooseModifiers(groups, [aoPonto.id, malPassado.id]))).toBe(
      'INVALID_MODIFIERS',
    );
    expect(() => chooseModifiers(groups, [aoPonto.id])).not.toThrow();
  });

  it('recusa opção repetida ou de fora do produto', () => {
    expect(code(() => chooseModifiers(groups, [aoPonto.id, bacon.id, bacon.id]))).toBe(
      'INVALID_MODIFIERS',
    );
    expect(code(() => chooseModifiers(groups, [aoPonto.id, newId()]))).toBe('INVALID_MODIFIERS');
  });

  it('a mensagem diz o grupo e quantas escolhas ele pede', () => {
    expect(() => chooseModifiers(groups, [])).toThrow('Ponto da carne pede 1 escolha');
  });
});

describe('valores (RN-ORD-15)', () => {
  it('total da linha e subtotal sem os cancelados', () => {
    expect(lineTotal({ unitPriceCents: 3200, modifiersCents: 500, quantity: 2 })).toBe(7400);
    expect(
      subtotal([
        { unitPriceCents: 3200, modifiersCents: 500, quantity: 2, status: 'ENVIADO' },
        { unitPriceCents: 700, modifiersCents: 0, quantity: 1, status: 'CANCELADO' },
        { unitPriceCents: 700, modifiersCents: 0, quantity: 3, status: 'PENDENTE' },
      ]),
    ).toBe(9500);
  });

  it('subtotal é a soma exata das linhas (inteiros, sem float)', () => {
    const item = fc.record({
      unitPriceCents: fc.integer({ min: 0, max: 9_999_999 }),
      modifiersCents: fc.integer({ min: 0, max: 99_999 }),
      quantity: fc.integer({ min: 1, max: 99 }),
      status: fc.constantFrom(...ORDER_ITEM_STATUSES),
    });
    fc.assert(
      fc.property(fc.array(item, { maxLength: 300 }), (items) => {
        const expected = items
          .filter((line) => line.status !== 'CANCELADO')
          .reduce((sum, line) => sum + lineTotal(line), 0);
        expect(subtotal(items)).toBe(expected);
        expect(Number.isSafeInteger(subtotal(items))).toBe(true);
      }),
    );
  });
});

describe('estoque do item cancelado (RN-ORD-13, ADR-0006)', () => {
  it.each([
    ['ENVIADO', true, 'ESTORNO'],
    ['EM_PREPARO', true, 'PERDA'],
    ['PRONTO', true, 'PERDA'],
    ['ENTREGUE', true, 'PERDA'],
    ['PRONTO', false, 'ESTORNO'],
    ['ENTREGUE', false, 'PERDA'],
  ] as const)('%s (com preparo: %s) → %s', (status, requiresPreparation, effect) => {
    expect(cancelStockEffect({ status, requiresPreparation })).toBe(effect);
  });
});
