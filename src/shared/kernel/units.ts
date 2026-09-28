import { DomainError } from './errors';
import { type BaseUnit, Quantity } from './quantity';

/** Unidades aceitas na entrada de dados (compra, contagem) e sua conversão para a base. */
export type MeasureUnit = 'kg' | 'g' | 'L' | 'ml' | 'un';

const CONVERSIONS: Readonly<Record<MeasureUnit, { base: BaseUnit; factor: number }>> = {
  kg: { base: 'g', factor: 1000 },
  g: { base: 'g', factor: 1 },
  L: { base: 'ml', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  un: { base: 'un', factor: 1 },
};

/** Converte "1.5" kg em 1500.000 g, "2" L em 2000.000 ml etc. (README B.7.5). */
export function toBaseQuantity(value: string, unit: MeasureUnit): Quantity {
  const conversion = Object.hasOwn(CONVERSIONS, unit) ? CONVERSIONS[unit] : undefined;
  if (!conversion) {
    throw new DomainError('UNKNOWN_UNIT', `Unidade desconhecida: ${unit}.`, 'VALIDATION', {
      unit,
    });
  }
  const parsed = Quantity.of(value, conversion.base);
  return Quantity.fromThousandths(parsed.thousandths * conversion.factor, conversion.base);
}
