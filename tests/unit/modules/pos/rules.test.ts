import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type BillItem,
  type BillOrder,
  cashSplit,
  computeBill,
  discountFromInput,
  exceedsLimit,
  itemShares,
  parsePercent,
  splitEvenly,
} from '@/modules/pos/domain/rules';

const code = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'SEM_CODIGO';
  }
};

const item = (id: string, priceCents: number, quantity = 1, extra: Partial<BillItem> = {}) => ({
  id,
  status: 'ENVIADO',
  unitPriceCents: priceCents,
  modifiersCents: 0,
  quantity,
  discountCents: 0,
  ...extra,
});

const mesa: BillOrder = {
  type: 'MESA',
  serviceFeeBp: 1000,
  serviceFeeWaived: false,
  discountCents: 0,
  paidCents: 0,
};

describe('valores da conta (RN-POS-02, Q-06)', () => {
  it('taxa de 10% sobre os itens; cancelados não contam', () => {
    const totals = computeBill(mesa, [
      item('a', 3200, 2),
      item('b', 700),
      item('c', 9999, 1, { status: 'CANCELADO' }),
    ]);
    expect(totals).toMatchObject({
      itemsCents: 7100,
      serviceFeeCents: 710,
      totalCents: 7810,
      balanceCents: 7810,
    });
  });

  it('taxa depois dos descontos, com arredondamento half-up', () => {
    const totals = computeBill({ ...mesa, discountCents: 355 }, [
      item('a', 3200, 2),
      item('b', 700),
    ]);
    // base 67,45 → taxa 6,745 → 6,75
    expect(totals).toMatchObject({ baseCents: 6745, serviceFeeCents: 675, totalCents: 7420 });
  });

  it('balcão e taxa retirada não têm taxa', () => {
    expect(computeBill({ ...mesa, type: 'BALCAO' }, [item('a', 3200)]).serviceFeeCents).toBe(0);
    expect(computeBill({ ...mesa, serviceFeeWaived: true }, [item('a', 3200)]).totalCents).toBe(
      3200,
    );
  });

  it('o total é sempre base + taxa, e a taxa nunca passa da porcentagem', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 1, max: 50_000 }), fc.integer({ min: 1, max: 99 })), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.integer({ min: 0, max: 10_000 }),
        (lines, feeBp) => {
          const totals = computeBill(
            { ...mesa, serviceFeeBp: feeBp },
            lines.map(([price, quantity], index) => item(String(index), price, quantity)),
          );
          expect(totals.totalCents).toBe(totals.baseCents + totals.serviceFeeCents);
          expect(
            Math.abs(totals.serviceFeeCents * 10_000 - totals.baseCents * feeBp),
          ).toBeLessThanOrEqual(5_000);
        },
      ),
    );
  });
});

describe('desconto (RN-POS-05, Q-07)', () => {
  it('valor ou percentual; não passa da base', () => {
    expect(discountFromInput('PERCENTUAL', 500, 7100)).toBe(355);
    expect(discountFromInput('VALOR', 400, 6400)).toBe(400);
    expect(code(() => discountFromInput('VALOR', 6401, 6400))).toBe('DISCOUNT_TOO_HIGH');
  });

  it('limite do perfil sem arredondar', () => {
    expect(exceedsLimit(320, 3200, 1000)).toBe(false);
    expect(exceedsLimit(321, 3200, 1000)).toBe(true);
    expect(exceedsLimit(1, 3200, 0)).toBe(true);
    expect(exceedsLimit(0, 3200, 0)).toBe(false);
  });

  it.each([
    ['10', 1000],
    ['12,5', 1250],
    ['0.75', 75],
    ['100%', 10_000],
  ])('percentual "%s" → %s pontos-base', (text, bp) => {
    expect(parsePercent(text)).toBe(bp);
  });

  it.each(['101', '1,234', 'abc', ''])('recusa o percentual "%s"', (text) => {
    expect(code(() => parsePercent(text))).toBe('INVALID_DISCOUNT');
  });
});

describe('pagamento (RN-POS-09, RN-POS-13)', () => {
  it('troco só sobre o que falta', () => {
    expect(cashSplit(3000, 2810)).toEqual({ appliedCents: 2810, changeCents: 190 });
    expect(cashSplit(2000, 2810)).toEqual({ appliedCents: 2000, changeCents: 0 });
  });

  it('divisão por pessoas soma exatamente o total', () => {
    expect(splitEvenly(7810, 3)).toEqual([2604, 2603, 2603]);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 1, max: 50 }),
        (total, n) => {
          const parts = splitEvenly(total, n);
          expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
          expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
        },
      ),
    );
    expect(code(() => splitEvenly(100, 0))).toBe('INVALID_SPLIT');
  });

  it('parte de um item: linha, desconto da conta proporcional e taxa', () => {
    const items = [item('a', 3200, 2), item('b', 700)];
    const totals = computeBill({ ...mesa, discountCents: 710 }, items);
    // b: 7,00 − 0,70 (10% do desconto proporcional) = 6,30 + 10% = 6,93
    expect(itemShares(totals, [items[1] as BillItem])).toEqual([{ itemId: 'b', amountCents: 693 }]);
  });

  it('as partes de todos os itens ficam a centavos do total', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 20_000 }), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 100 }),
        (prices, discountPct) => {
          const items = prices.map((price, index) => item(String(index), price));
          const gross = prices.reduce((sum, price) => sum + price, 0);
          const totals = computeBill(
            { ...mesa, discountCents: Math.floor((gross * discountPct) / 100) },
            items,
          );
          const sum = itemShares(totals, items).reduce(
            (total, share) => total + share.amountCents,
            0,
          );
          expect(Math.abs(sum - totals.totalCents)).toBeLessThanOrEqual(items.length * 2);
        },
      ),
    );
  });
});
