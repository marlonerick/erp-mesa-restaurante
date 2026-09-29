import { type BaseUnit, divideRoundHalfUp, formatQuantityText } from '@/shared/kernel';
import { formatBRL } from './money';

/** Unidade maior para mostrar (1000 g = 1 kg; 1000 ml = 1 L). */
const BIG_UNIT: Readonly<Record<BaseUnit, { label: string; small: string } | null>> = {
  g: { label: 'kg', small: 'g' },
  ml: { label: 'L', small: 'ml' },
  un: null,
};

/**
 * Quantidade em milésimos da base → texto da tela: 2 500 000 (g) → "2,5 kg"; 850 000 → "850 g";
 * 3 000 (un) → "3 un". Nunca usa float: a divisão por 1000 é só troca de vírgula.
 */
export function formatAmount(thousandths: number, unit: BaseUnit): string {
  const big = BIG_UNIT[unit];
  if (big && Math.abs(thousandths) >= 1_000_000) {
    // milésimos de g → g com 3 casas; ÷1000 = kg: mesma sequência de dígitos, vírgula 3 casas antes
    return `${formatQuantityText(Number(divideRoundHalfUp(BigInt(thousandths), 1000n)))} ${big.label}`;
  }
  return `${formatQuantityText(thousandths)} ${big?.small ?? 'un'}`;
}

/** Custo por unidade base (micro-reais) → "R$ 40,00/kg", "R$ 0,80/un" (unidade de compra). */
export function formatUnitCost(micros: bigint, unit: BaseUnit): string {
  const big = BIG_UNIT[unit];
  // centavos por unidade = micros ÷ 10⁴; por kg/L = micros × 1000 ÷ 10⁴
  const cents = big
    ? divideRoundHalfUp(micros * 1000n, 10_000n)
    : divideRoundHalfUp(micros, 10_000n);
  return `${formatBRL(Number(cents))}/${big?.label ?? 'un'}`;
}

export const UNIT_NAMES: Readonly<Record<BaseUnit, string>> = {
  g: 'grama (g)',
  ml: 'mililitro (ml)',
  un: 'unidade (un)',
};
