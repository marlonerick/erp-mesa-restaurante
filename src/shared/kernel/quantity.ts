import { DomainError } from './errors';
import { divideRoundHalfUp } from './rounding';

/** Unidades base de estoque e venda (README B.7.5). */
export type BaseUnit = 'g' | 'ml' | 'un';

// DECIMAL(14,3): até 11 dígitos inteiros e 3 decimais
const MAX_THOUSANDTHS = 99_999_999_999_999;
const DECIMAL_FORMAT = /^(-?)(\d{1,11})(?:\.(\d{1,3}))?$/;

/**
 * Quantidade exata em milésimos da unidade base — espelha DECIMAL(14,3) sem usar float.
 */
export class Quantity {
  private constructor(
    readonly thousandths: number,
    readonly unit: BaseUnit,
  ) {}

  /** Cria a partir de texto decimal com ponto: "0.350", "12", "-1.5". */
  static of(value: string, unit: BaseUnit): Quantity {
    const match = DECIMAL_FORMAT.exec(value);
    if (!match) {
      throw new DomainError(
        'INVALID_QUANTITY',
        'Quantidade inválida: use até 3 casas decimais, separadas por ponto.',
        'VALIDATION',
        { value },
      );
    }
    const [, sign = '', integerPart = '0', fraction = ''] = match;
    const magnitude = Number(integerPart) * 1000 + Number(fraction.padEnd(3, '0'));
    return Quantity.fromThousandths(sign === '-' ? -magnitude : magnitude, unit);
  }

  static fromThousandths(thousandths: number, unit: BaseUnit): Quantity {
    if (!Number.isInteger(thousandths) || Math.abs(thousandths) > MAX_THOUSANDTHS) {
      throw new DomainError(
        'INVALID_QUANTITY',
        'Quantidade fora do limite permitido.',
        'VALIDATION',
        { thousandths },
      );
    }
    // Normaliza -0 para 0
    return new Quantity(thousandths === 0 ? 0 : thousandths, unit);
  }

  static zero(unit: BaseUnit): Quantity {
    return new Quantity(0, unit);
  }

  add(other: Quantity): Quantity {
    this.assertSameUnit(other);
    return Quantity.fromThousandths(this.thousandths + other.thousandths, this.unit);
  }

  subtract(other: Quantity): Quantity {
    this.assertSameUnit(other);
    return Quantity.fromThousandths(this.thousandths - other.thousandths, this.unit);
  }

  negate(): Quantity {
    return Quantity.fromThousandths(-this.thousandths, this.unit);
  }

  /**
   * Multiplica por um fator em milésimos (ex.: ficha 150 g × 2 itens = 150 g × 2.000), arredondando
   * a milésimos uma vez (half-up, ADR-0003). Só inteiros — nunca float.
   */
  times(factorThousandths: number): Quantity {
    return Quantity.fromThousandths(
      Number(divideRoundHalfUp(BigInt(this.thousandths) * BigInt(factorThousandths), 1000n)),
      this.unit,
    );
  }

  isZero(): boolean {
    return this.thousandths === 0;
  }

  isNegative(): boolean {
    return this.thousandths < 0;
  }

  isPositive(): boolean {
    return this.thousandths > 0;
  }

  equals(other: Quantity): boolean {
    return this.unit === other.unit && this.thousandths === other.thousandths;
  }

  compareTo(other: Quantity): -1 | 0 | 1 {
    this.assertSameUnit(other);
    return this.thousandths === other.thousandths
      ? 0
      : this.thousandths < other.thousandths
        ? -1
        : 1;
  }

  /** Texto decimal com 3 casas, pronto para DECIMAL(14,3). */
  toDecimalString(): string {
    const sign = this.thousandths < 0 ? '-' : '';
    const magnitude = Math.abs(this.thousandths);
    const integerPart = Math.trunc(magnitude / 1000);
    const fraction = String(magnitude % 1000).padStart(3, '0');
    return `${sign}${String(integerPart)}.${fraction}`;
  }

  toJSON(): { value: string; unit: BaseUnit } {
    return { value: this.toDecimalString(), unit: this.unit };
  }

  private assertSameUnit(other: Quantity): void {
    if (other.unit !== this.unit) {
      throw new DomainError(
        'UNIT_MISMATCH',
        `Unidades incompatíveis: ${this.unit} e ${other.unit}.`,
        'VALIDATION',
        { left: this.unit, right: other.unit },
      );
    }
  }
}
