import { describe, expect, it } from 'vitest';
import {
  blindCount,
  cashReason,
  expectedByMethod,
  DENOMINATIONS,
  movementAmount,
  needsRecount,
  openingAmount,
  sangriasAboveExpected,
  sumDenominations,
} from '@/modules/cashier/domain/rules';

const code = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'SEM_CODIGO';
  }
};

describe('valores do caixa (RN-CASH-02, RN-CASH-03)', () => {
  it('fundo de troco de 0 a R$ 100.000,00', () => {
    expect(openingAmount(0)).toBe(0);
    expect(openingAmount(10_000_000)).toBe(10_000_000);
    expect(code(() => openingAmount(-1))).toBe('INVALID_CASH_AMOUNT');
    expect(code(() => openingAmount(null))).toBe('INVALID_CASH_AMOUNT');
  });

  it('sangria e suprimento maiores que zero; motivo de 3 a 200', () => {
    expect(code(() => movementAmount(0))).toBe('INVALID_CASH_AMOUNT');
    expect(movementAmount(1)).toBe(1);
    expect(cashReason('  troco   extra ')).toBe('troco extra');
    expect(code(() => cashReason('ok'))).toBe('CASH_REASON_REQUIRED');
  });
});

describe('esperado e fechamento cego (RN-CASH-05, RN-CASH-06, Q-16)', () => {
  const expected = expectedByMethod(10_000, [
    { method: 'DINHEIRO', amountCents: 4550 - 1000 },
    { method: 'PIX', amountCents: 3000 },
  ]);

  it('dinheiro = fundo + movimentações em dinheiro; demais formas = só as movimentações', () => {
    expect(expected).toEqual({
      DINHEIRO: 13_550,
      PIX: 3000,
      CARTAO_CREDITO: 0,
      CARTAO_DEBITO: 0,
      OUTRO: 0,
    });
  });

  it('diferença = informado − esperado; formas sem movimento e sem informação ficam de fora', () => {
    expect(blindCount(expected, { DINHEIRO: 13_000 })).toEqual([
      { method: 'DINHEIRO', expectedCents: 13_550, declaredCents: 13_000, differenceCents: -550 },
      { method: 'PIX', expectedCents: 3000, declaredCents: null, differenceCents: null },
    ]);
  });

  it('dinheiro é obrigatório', () => {
    expect(code(() => blindCount(expected, { PIX: 3000 }))).toBe('CASH_COUNT_REQUIRED');
  });
});

describe('sangria acima do esperado (decisão I-3)', () => {
  it('aponta só a sangria que levou o dinheiro abaixo de zero', () => {
    const flagged = sangriasAboveExpected(10_000, [
      { id: 'a', type: 'SANGRIA', paymentMethod: 'DINHEIRO', amountCents: -8000 },
      { id: 'b', type: 'VENDA', paymentMethod: 'PIX', amountCents: 5000 },
      { id: 'c', type: 'SANGRIA', paymentMethod: 'DINHEIRO', amountCents: -8000 },
      { id: 'd', type: 'SUPRIMENTO', paymentMethod: 'DINHEIRO', amountCents: 9000 },
      { id: 'e', type: 'SANGRIA', paymentMethod: 'DINHEIRO', amountCents: -1000 },
    ] as const);
    expect(flagged.map((movement) => movement.id)).toEqual(['c']);
  });
});

describe('fechamento mais fácil (E10-6)', () => {
  const line = (differenceCents: number | null) => ({
    method: 'DINHEIRO' as const,
    expectedCents: 10_000,
    declaredCents: differenceCents === null ? null : 10_000 + differenceCents,
    differenceCents,
  });

  it('pede UMA recontagem quando o dinheiro não bate', () => {
    expect(needsRecount([line(-1000)], null)).toBe(true);
    expect(needsRecount([line(1)], null)).toBe(true);
    // Bateu: fecha direto
    expect(needsRecount([line(0)], null)).toBe(false);
    // Já recontou: fecha mesmo com diferença
    expect(needsRecount([line(-500)], 9000)).toBe(false);
    // Diferença em outra forma não pede recontagem do dinheiro
    expect(
      needsRecount(
        [
          line(0),
          { method: 'PIX', expectedCents: 3000, declaredCents: 2000, differenceCents: -1000 },
        ],
        null,
      ),
    ).toBe(false);
  });

  it('soma cédulas e moedas; quantidade inválida conta como zero', () => {
    expect(sumDenominations({ 10_000: 2, 5_000: 1, 25: 4, 5: 1 })).toBe(25_105);
    expect(sumDenominations({})).toBe(0);
    expect(sumDenominations({ 2_000: -3, 1_000: 1.5, 500: Number.NaN, 200: 1 })).toBe(200);
    // Valores em ordem decrescente, sem repetir
    const values = DENOMINATIONS.map((item) => item.cents);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
    expect(new Set(values).size).toBe(values.length);
  });
});
