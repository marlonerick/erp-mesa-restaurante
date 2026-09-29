import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  averageCostAfterEntry,
  conversionName,
  isBelowMinimum,
  movementValue,
  optionalNote,
  parseAmount,
  parseConversionFactor,
  parsePaidText,
  requiredNote,
  toBase,
  validateBaseUnit,
  validateLossReason,
} from '@/modules/inventory/domain/rules';
import { Money, Quantity, UnitCost } from '@/shared/kernel';

const code = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

const g = (value: string) => Quantity.of(value, 'g');
const cost = (value: string) => UnitCost.fromDecimalString(value);

describe('conversão para a unidade base (RN-INV-04)', () => {
  const caixa = [{ id: 'cx', unitName: 'caixa', factorThousandths: 12_000 }];

  it.each([
    [1500, 'kg', 'g', '1500.000'],
    [2000, 'L', 'ml', '2000.000'],
    [250, 'g', 'g', '0.250'],
    [3000, 'un', 'un', '3.000'],
  ] as const)('%i milésimos de %s → %s', (amount, unit, base, expected) => {
    expect(toBase(amount, unit, base, []).toDecimalString()).toBe(expected);
  });

  it('usa a conversão do insumo ("caixa" = 12 un)', () => {
    expect(toBase(2500, 'cx', 'un', caixa).toDecimalString()).toBe('30.000');
  });

  it('recusa unidade que não serve para a base', () => {
    expect(code(() => toBase(1000, 'kg', 'ml', []))).toBe('INVALID_UNIT');
    expect(code(() => toBase(1000, 'L', 'un', caixa))).toBe('INVALID_UNIT');
    expect(code(() => toBase(1000, 'toString', 'g', []))).toBe('INVALID_UNIT');
  });
});

describe('custo médio (RN-INV-05, E5-3)', () => {
  it('primeira compra define o custo: 2 kg por R$ 80,00 → R$ 0,04/g', () => {
    const result = averageCostAfterEntry(g('0'), UnitCost.zero(), g('2000'), Money.fromCents(8000));
    expect(result.toDecimalString()).toBe('0.040000');
  });

  it('segunda compra pondera pelas quantidades', () => {
    const result = averageCostAfterEntry(
      g('2000'),
      cost('0.040000'),
      g('1000'),
      Money.fromCents(4600),
    );
    expect(result.toDecimalString()).toBe('0.042000');
  });

  it('saldo negativo conta como zero: vale o custo da compra nova', () => {
    const result = averageCostAfterEntry(
      g('-500'),
      cost('0.090000'),
      g('1000'),
      Money.fromCents(5000),
    );
    expect(result.toDecimalString()).toBe('0.050000');
  });

  it('o custo médio fica sempre entre o antigo e o da compra', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 0, max: 9_999_999 }),
        (balance, oldMicros, entry, paid) => {
          const old = UnitCost.fromMicros(BigInt(oldMicros));
          const entryCost = UnitCost.fromTotal(
            Money.fromCents(paid),
            Quantity.fromThousandths(entry, 'g'),
          );
          const result = averageCostAfterEntry(
            Quantity.fromThousandths(balance, 'g'),
            old,
            Quantity.fromThousandths(entry, 'g'),
            Money.fromCents(paid),
          ).micros;
          const low = old.micros < entryCost.micros ? old.micros : entryCost.micros;
          const high = old.micros > entryCost.micros ? old.micros : entryCost.micros;
          expect(result >= low - 1n && result <= high + 1n).toBe(true);
        },
      ),
    );
  });
});

describe('valor da movimentação (RN-INV-10)', () => {
  it('quantidade × custo, com o sinal da quantidade, arredondado a centavos', () => {
    expect(movementValue(g('-150'), cost('0.040000')).cents).toBe(-600);
    expect(movementValue(g('3'), cost('0.040000')).cents).toBe(12);
    expect(movementValue(g('-0.1'), cost('0.049000')).cents).toBe(0);
  });
});

describe('validações', () => {
  it('quantidade: maior que zero; a contagem aceita zero', () => {
    expect(parseAmount('1,5')).toBe(1500);
    expect(code(() => parseAmount('0'))).toBe('INVALID_QUANTITY');
    expect(parseAmount('0', { allowZero: true })).toBe(0);
    expect(code(() => parseAmount('-1'))).toBe('INVALID_QUANTITY');
  });

  it('unidade base, motivo de perda e valor pago', () => {
    expect(validateBaseUnit('ml')).toBe('ml');
    expect(code(() => validateBaseUnit('kg'))).toBe('INVALID_BASE_UNIT');
    expect(validateLossReason('VENCIDO')).toBe('VENCIDO');
    expect(code(() => validateLossReason('CANCELAMENTO_APOS_PREPARO'))).toBe('INVALID_LOSS_REASON');
    expect(parsePaidText('88,00').cents).toBe(8800);
    expect(code(() => parsePaidText('100.000,00'))).toBe('INVALID_PRICE');
  });

  it('observação: obrigatória (3 a 200) ou opcional', () => {
    expect(requiredNote('  uso   interno ')).toBe('uso interno');
    expect(code(() => requiredNote('ok'))).toBe('NOTE_REQUIRED');
    expect(optionalNote('   ')).toBeNull();
    expect(code(() => requiredNote('a'.repeat(201)))).toBe('NOTE_REQUIRED');
  });

  it('conversão do insumo', () => {
    expect(conversionName(' caixa ')).toBe('caixa');
    expect(parseConversionFactor('12')).toBe(12_000);
    expect(code(() => parseConversionFactor('0'))).toBe('INVALID_CONVERSION');
    expect(code(() => conversionName('a'.repeat(21)))).toBe('INVALID_CONVERSION');
  });

  it('abaixo do mínimo só se houver mínimo', () => {
    expect(isBelowMinimum(g('800'), g('1000'))).toBe(true);
    expect(isBelowMinimum(g('1000'), g('1000'))).toBe(true);
    expect(isBelowMinimum(g('1001'), g('1000'))).toBe(false);
    expect(isBelowMinimum(g('-5'), g('0'))).toBe(false);
  });
});
