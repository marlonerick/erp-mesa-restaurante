import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cancelReason,
  cashFlowDays,
  categoryName,
  DEFAULT_CATEGORIES,
  financeAmount,
  financeDate,
  financeDescription,
  type PaidTotal,
} from '@/modules/finance/domain/rules';

const code = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'SEM_CODIGO';
  }
};

describe('lançamentos (RN-FIN-04)', () => {
  it('valor de R$ 0,01 a R$ 10.000.000,00', () => {
    expect(financeAmount(1)).toBe(1);
    expect(financeAmount(1_000_000_000)).toBe(1_000_000_000);
    expect(code(() => financeAmount(0))).toBe('INVALID_FINANCE_AMOUNT');
    expect(code(() => financeAmount(1_000_000_001))).toBe('INVALID_FINANCE_AMOUNT');
    expect(code(() => financeAmount(null))).toBe('INVALID_FINANCE_AMOUNT');
    expect(code(() => financeAmount(1.5))).toBe('INVALID_FINANCE_AMOUNT');
  });

  it('descrição de 3 a 120 caracteres, sem espaços sobrando', () => {
    expect(financeDescription('  Conta   de luz ')).toBe('Conta de luz');
    expect(code(() => financeDescription('ab'))).toBe('INVALID_FINANCE_DESCRIPTION');
    expect(code(() => financeDescription('x'.repeat(121)))).toBe('INVALID_FINANCE_DESCRIPTION');
  });

  it('data de 2000-01-01 até um ano depois de hoje', () => {
    expect(financeDate('2026-03-20', '2026-03-14')).toBe('2026-03-20');
    expect(financeDate('2027-03-15', '2026-03-14')).toBe('2027-03-15');
    expect(code(() => financeDate('2027-03-16', '2026-03-14'))).toBe('INVALID_FINANCE_DATE');
    expect(code(() => financeDate('1999-12-31', '2026-03-14'))).toBe('INVALID_FINANCE_DATE');
    expect(code(() => financeDate('2026-02-30', '2026-03-14'))).toBe('INVALID_FINANCE_DATE');
  });

  it('categoria de 2 a 60 caracteres; motivo do cancelamento de 3 a 200', () => {
    expect(categoryName(' Marketing ')).toBe('Marketing');
    expect(code(() => categoryName('M'))).toBe('INVALID_FINANCE_CATEGORY');
    expect(cancelReason('lançado em dobro')).toBe('lançado em dobro');
    expect(code(() => cancelReason('  '))).toBe('CANCEL_REASON_REQUIRED');
  });

  it('categorias iniciais (E9-2): Vendas é a única do sistema', () => {
    expect(DEFAULT_CATEGORIES.filter((category) => category.systemCode)).toEqual([
      { type: 'RECEITA', name: 'Vendas', systemCode: 'VENDAS' },
    ]);
    expect(DEFAULT_CATEGORIES.filter((category) => category.type === 'DESPESA')).toHaveLength(7);
  });
});

describe('fluxo de caixa (RN-FIN-07)', () => {
  it('agrupa por dia, em ordem, com saldo e acumulado', () => {
    expect(
      cashFlowDays([
        { date: '2026-03-14', type: 'DESPESA', amountCents: 18_000 },
        { date: '2026-03-13', type: 'RECEITA', amountCents: 100_000 },
        { date: '2026-03-14', type: 'RECEITA', amountCents: 5_000 },
      ]),
    ).toEqual([
      {
        date: '2026-03-13',
        inflowCents: 100_000,
        outflowCents: 0,
        netCents: 100_000,
        cumulativeCents: 100_000,
      },
      {
        date: '2026-03-14',
        inflowCents: 5_000,
        outflowCents: 18_000,
        netCents: -13_000,
        cumulativeCents: 87_000,
      },
    ]);
    expect(cashFlowDays([])).toEqual([]);
  });

  it('o último acumulado é sempre entradas − saídas do período', () => {
    const total = fc.record({
      date: fc.constantFrom('2026-03-12', '2026-03-13', '2026-03-14'),
      type: fc.constantFrom('RECEITA' as const, 'DESPESA' as const),
      amountCents: fc.integer({ min: 1, max: 1_000_000 }),
    });
    fc.assert(
      fc.property(fc.array(total, { maxLength: 30 }), (totals: PaidTotal[]) => {
        const days = cashFlowDays(totals);
        const expected = totals.reduce(
          (sum, item) => sum + (item.type === 'RECEITA' ? item.amountCents : -item.amountCents),
          0,
        );
        expect(days.at(-1)?.cumulativeCents ?? 0).toBe(expected);
      }),
    );
  });
});
