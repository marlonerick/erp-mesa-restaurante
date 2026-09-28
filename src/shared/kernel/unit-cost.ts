import { DomainError } from './errors';
import { Money } from './money';
import type { Quantity } from './quantity';
import { divideRoundHalfUp } from './rounding';

// DECIMAL(18,6): até 12 dígitos inteiros e 6 decimais, sempre não negativo
const DECIMAL_FORMAT = /^(\d{1,12})(?:\.(\d{1,6}))?$/;
const MAX_MICROS = 999_999_999_999_999_999n;
const MICROS_PER_CENT = 10_000n;

/**
 * Custo por unidade base de um insumo (R$/g, R$/ml, R$/un) com precisão de micro-real
 * (ADR-0003, decisão Q-19). Evita o erro de guardar R$ 0,0459/g em centavos.
 */
export class UnitCost {
  private constructor(readonly micros: bigint) {}

  static fromDecimalString(value: string): UnitCost {
    const match = DECIMAL_FORMAT.exec(value);
    if (!match) {
      throw new DomainError(
        'INVALID_UNIT_COST',
        'Custo unitário inválido: use até 6 casas decimais, separadas por ponto.',
        'VALIDATION',
        { value },
      );
    }
    const [, integerPart = '0', fraction = ''] = match;
    return UnitCost.fromMicros(BigInt(integerPart) * 1_000_000n + BigInt(fraction.padEnd(6, '0')));
  }

  static fromMicros(micros: bigint): UnitCost {
    if (micros < 0n || micros > MAX_MICROS) {
      throw new DomainError('INVALID_UNIT_COST', 'Custo unitário fora do limite.', 'VALIDATION');
    }
    return new UnitCost(micros);
  }

  static zero(): UnitCost {
    return new UnitCost(0n);
  }

  /** Custo unitário de uma compra: valor pago ÷ quantidade na unidade base. */
  static fromTotal(total: Money, quantity: Quantity): UnitCost {
    if (!quantity.isPositive() || total.isNegative()) {
      throw new DomainError(
        'INVALID_UNIT_COST',
        'Para calcular o custo, a quantidade deve ser maior que zero e o valor não pode ser negativo.',
        'VALIDATION',
      );
    }
    // micros por unidade = (centavos × 10⁴) ÷ (milésimos ÷ 10³)
    return UnitCost.fromMicros(
      divideRoundHalfUp(
        BigInt(total.cents) * MICROS_PER_CENT * 1000n,
        BigInt(quantity.thousandths),
      ),
    );
  }

  toDecimalString(): string {
    const integerPart = this.micros / 1_000_000n;
    const fraction = (this.micros % 1_000_000n).toString().padStart(6, '0');
    return `${integerPart.toString()}.${fraction}`;
  }
}

export interface CostLine {
  readonly quantity: Quantity;
  readonly unitCost: UnitCost;
}

/**
 * Custo total (ex.: custo teórico de uma ficha técnica). Soma com precisão total
 * (milésimos × micro-reais) e arredonda para centavos UMA única vez (ADR-0003).
 */
export function totalCost(lines: readonly CostLine[]): Money {
  // milésimos × micros = 10⁻⁹ R$ ; 1 centavo = 10⁷ dessas unidades
  const nanoReais = lines.reduce(
    (sum, line) => sum + BigInt(line.quantity.thousandths) * line.unitCost.micros,
    0n,
  );
  return Money.fromBigInt(divideRoundHalfUp(nanoReais, 10_000_000n));
}
