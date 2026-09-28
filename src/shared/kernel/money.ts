import { DomainError } from './errors';
import type { Percentage } from './percentage';
import type { Quantity } from './quantity';
import { divideRoundHalfUp } from './rounding';

/**
 * Valor monetário em centavos inteiros (ADR-0003). Imutável.
 * Todo arredondamento é half-up (meio para longe de zero) e acontece uma vez, no fim do cálculo.
 */
export class Money {
  private constructor(readonly cents: number) {}

  static fromCents(cents: number): Money {
    if (!Number.isSafeInteger(cents)) {
      throw new DomainError('INVALID_MONEY_AMOUNT', 'Valor monetário inválido.', 'VALIDATION', {
        cents,
      });
    }
    return new Money(cents === 0 ? 0 : cents);
  }

  static zero(): Money {
    return new Money(0);
  }

  static sum(values: readonly Money[]): Money {
    return values.reduce((total, value) => total.add(value), Money.zero());
  }

  add(other: Money): Money {
    return Money.fromCents(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return Money.fromCents(this.cents - other.cents);
  }

  negate(): Money {
    return Money.fromCents(-this.cents);
  }

  /** Aplica um percentual (ex.: taxa de serviço de 10%). */
  percentage(percentage: Percentage): Money {
    return Money.fromBigInt(
      divideRoundHalfUp(BigInt(this.cents) * BigInt(percentage.basisPoints), 10_000n),
    );
  }

  /**
   * Preço × quantidade (inclusive fracionada). ATENÇÃO: a quantidade precisa estar na MESMA
   * unidade do preço — a unidade de `Quantity` não é convertida aqui. Venda por peso
   * (preço por kg) será modelada na Etapa 4 (pergunta Q-10).
   */
  multiplyBy(quantity: Quantity): Money {
    return Money.fromBigInt(
      divideRoundHalfUp(BigInt(this.cents) * BigInt(quantity.thousandths), 1000n),
    );
  }

  /**
   * Divide em `parts` partes cuja soma é exatamente o total. Os centavos que sobram vão
   * para as primeiras partes (divisão de conta por pessoas — ADR-0003).
   */
  allocate(parts: number): Money[] {
    if (!Number.isInteger(parts) || parts < 1) {
      throw new DomainError('INVALID_ALLOCATION', 'Número de partes inválido.', 'VALIDATION', {
        parts,
      });
    }
    const sign = this.cents < 0 ? -1 : 1;
    const magnitude = Math.abs(this.cents);
    const base = Math.floor(magnitude / parts);
    const remainder = magnitude % parts;
    return Array.from({ length: parts }, (_, index) =>
      Money.fromCents(sign * (base + (index < remainder ? 1 : 0))),
    );
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  isPositive(): boolean {
    return this.cents > 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  compareTo(other: Money): -1 | 0 | 1 {
    return this.cents === other.cents ? 0 : this.cents < other.cents ? -1 : 1;
  }

  /** "1234.56" — para DECIMAL e integrações. A formatação em R$ é responsabilidade da UI. */
  toDecimalString(): string {
    const sign = this.cents < 0 ? '-' : '';
    const magnitude = Math.abs(this.cents);
    const fraction = String(magnitude % 100).padStart(2, '0');
    return `${sign}${String(Math.trunc(magnitude / 100))}.${fraction}`;
  }

  toJSON(): number {
    return this.cents;
  }

  /** @internal Converte resultado de cálculo em bigint, validando o intervalo seguro. */
  static fromBigInt(cents: bigint): Money {
    if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new DomainError(
        'INVALID_MONEY_AMOUNT',
        'Valor monetário fora do limite.',
        'VALIDATION',
      );
    }
    return Money.fromCents(Number(cents));
  }
}
