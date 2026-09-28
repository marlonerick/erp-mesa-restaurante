import { DomainError } from './errors';

const MAX_BASIS_POINTS = 10_000;

/** Percentual em pontos-base: 10% = 1000 (ADR-0003). Limitado a 0%–100%. */
export class Percentage {
  private constructor(readonly basisPoints: number) {}

  static fromBasisPoints(basisPoints: number): Percentage {
    if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > MAX_BASIS_POINTS) {
      throw new DomainError(
        'INVALID_PERCENTAGE',
        'Percentual inválido: informe um valor entre 0% e 100%.',
        'VALIDATION',
        { basisPoints },
      );
    }
    return new Percentage(basisPoints);
  }

  static zero(): Percentage {
    return new Percentage(0);
  }

  isGreaterThan(other: Percentage): boolean {
    return this.basisPoints > other.basisPoints;
  }
}
