import {
  type BaseUnit,
  DomainError,
  Money,
  normalizeName,
  parseMoneyText,
  parseQuantityText,
  Quantity,
  totalCost,
  UnitCost,
  divideRoundHalfUp,
} from '@/shared/kernel';

// Regras puras do estoque (docs/modules/inventory.md §3).

export const BASE_UNITS = ['g', 'ml', 'un'] as const;
export const LOSS_REASONS = ['VENCIDO', 'ESTRAGADO', 'ERRO_PREPARO', 'QUEBRA', 'OUTRO'] as const;
export type LossReason = (typeof LOSS_REASONS)[number];

export const ingredientName = (input: string) => normalizeName(input, 2, 80);

export function validateBaseUnit(unit: string): BaseUnit {
  if (!(BASE_UNITS as readonly string[]).includes(unit)) {
    throw new DomainError(
      'INVALID_BASE_UNIT',
      'Escolha grama, mililitro ou unidade.',
      'VALIDATION',
    );
  }
  return unit as BaseUnit;
}

const invalidQuantity = () =>
  new DomainError(
    'INVALID_QUANTITY',
    'Informe uma quantidade maior que zero, com até 3 casas decimais (ex.: 1,5).',
    'VALIDATION',
  );

/** Texto digitado → milésimos; `allowZero` para a contagem (contou zero). RN-INV-04. */
export function parseAmount(text: string, options: { allowZero?: boolean } = {}): number {
  const thousandths = parseQuantityText(text);
  if (thousandths === null || (thousandths === 0 && !options.allowZero)) throw invalidQuantity();
  return thousandths;
}

/** Unidades fixas por base (RN-INV-04): kg/g → g; L/ml → ml; un → un. Fator em milésimos. */
const FIXED_UNITS: Readonly<Record<BaseUnit, Readonly<Record<string, number>>>> = {
  g: { g: 1000, kg: 1_000_000 },
  ml: { ml: 1000, L: 1_000_000 },
  un: { un: 1000 },
};

export const fixedUnitsFor = (base: BaseUnit) => Object.keys(FIXED_UNITS[base]);

export interface Conversion {
  readonly id: string;
  readonly unitName: string;
  /** Fator para a base, em milésimos ("caixa" = 12 un → 12000). */
  readonly factorThousandths: number;
}

/**
 * Quantidade digitada na unidade escolhida → quantidade na base. `unit` é uma unidade fixa ("kg")
 * ou o id de uma conversão do insumo. Resultado arredondado a milésimos (half-up).
 */
export function toBase(
  amountThousandths: number,
  unit: string,
  base: BaseUnit,
  conversions: readonly Conversion[],
): Quantity {
  // Só chaves PRÓPRIAS: "toString" ou "constructor" vindos do formulário não são unidades
  const units = FIXED_UNITS[base];
  const fixed = Object.hasOwn(units, unit) ? units[unit] : undefined;
  const factor = fixed ?? conversions.find((item) => item.id === unit)?.factorThousandths;
  if (factor === undefined) {
    throw new DomainError('INVALID_UNIT', 'Esta unidade não serve para este insumo.', 'VALIDATION');
  }
  return Quantity.fromThousandths(amountThousandths, base).times(factor);
}

/** Fator da conversão do insumo (> 0, até 3 casas) — RN-INV-03. */
export function parseConversionFactor(text: string): number {
  const thousandths = parseQuantityText(text);
  if (thousandths === null || thousandths === 0) {
    throw new DomainError(
      'INVALID_CONVERSION',
      'Informe quanto a unidade vale na base, maior que zero (ex.: 12).',
      'VALIDATION',
    );
  }
  return thousandths;
}

export const conversionName = (input: string) => {
  const name = input.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 20) {
    throw new DomainError(
      'INVALID_CONVERSION',
      'O nome da unidade deve ter de 1 a 20 caracteres (ex.: caixa).',
      'VALIDATION',
    );
  }
  return name;
};

/** Valor pago na compra: R$ 0,00 a R$ 99.999,99 (RN-INV-05). */
export function parsePaidText(text: string): Money {
  const cents = parseMoneyText(text);
  if (cents === null || cents > 9_999_999) {
    throw new DomainError(
      'INVALID_PRICE',
      'Informe um valor entre R$ 0,00 e R$ 99.999,99.',
      'VALIDATION',
    );
  }
  return Money.fromCents(cents);
}

/** Observação obrigatória (saída; perda "outro"): 3 a 200 caracteres. */
export function requiredNote(input: string | null): string {
  const note = (input ?? '').trim().replace(/\s+/g, ' ');
  if (note.length < 3 || note.length > 200) {
    throw new DomainError('NOTE_REQUIRED', 'Explique o motivo (3 a 200 caracteres).', 'VALIDATION');
  }
  return note;
}

export function optionalNote(input: string | null): string | null {
  const note = (input ?? '').trim().replace(/\s+/g, ' ');
  if (note === '') return null;
  return requiredNote(note);
}

export function validateLossReason(reason: string): LossReason {
  if (!(LOSS_REASONS as readonly string[]).includes(reason)) {
    throw new DomainError('INVALID_LOSS_REASON', 'Escolha um motivo da lista.', 'VALIDATION');
  }
  return reason as LossReason;
}

/**
 * Custo médio depois de uma entrada (RN-INV-05, E5-3):
 * (saldo⁺ × custo + valor pago) ÷ (saldo⁺ + quantidade), com saldo⁺ = max(saldo, 0).
 * Em inteiros: milésimos × micro-reais = 10⁻⁹ R$; 1 centavo = 10⁷ dessas unidades.
 */
export function averageCostAfterEntry(
  balance: Quantity,
  currentCost: UnitCost,
  entry: Quantity,
  paid: Money,
): UnitCost {
  const positive = BigInt(Math.max(balance.thousandths, 0));
  const value = positive * currentCost.micros + BigInt(paid.cents) * 10_000_000n;
  const quantity = positive + BigInt(entry.thousandths);
  return UnitCost.fromMicros(divideRoundHalfUp(value, quantity));
}

/** Valor de uma movimentação que não é compra: quantidade × custo, em centavos (RN-INV-10). */
export function movementValue(quantity: Quantity, cost: UnitCost): Money {
  const value = totalCost([
    {
      quantity: Quantity.fromThousandths(Math.abs(quantity.thousandths), quantity.unit),
      unitCost: cost,
    },
  ]);
  return quantity.isNegative() ? value.negate() : value;
}

/** O mínimo foi atingido? Só alerta se houver mínimo (> 0) — RN-INV-11. */
export const isBelowMinimum = (balance: Quantity, minimum: Quantity) =>
  minimum.isPositive() && balance.compareTo(minimum) <= 0;

/** "2 kg", "1,5 caixa" — o que a pessoa digitou, para o extrato. */
export function enteredText(amountText: string, unitLabel: string): string {
  return `${amountText.trim()} ${unitLabel}`.slice(0, 40);
}
