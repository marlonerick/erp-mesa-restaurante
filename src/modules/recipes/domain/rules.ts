import { DomainError, divideRoundHalfUp, type Id, parseQuantityText } from '@/shared/kernel';

// Regras puras da ficha técnica (docs/modules/recipes.md §2).

export const MAX_RECIPE_LINES = 30;
export type RecipeKind = 'PRODUCT' | 'MODIFIER';

export interface RecipeLineInput {
  readonly ingredientId: Id;
  /** Texto digitado, na unidade base do insumo ("150", "0,5"). */
  readonly quantity: string;
}

export interface RecipeLine {
  readonly ingredientId: Id;
  /** Milésimos da unidade base, para UMA unidade vendida. */
  readonly quantity: number;
}

/** Linhas válidas (RN-REC-02): quantidade > 0 com até 3 casas, sem insumo repetido, até 30. */
export function validateLines(lines: readonly RecipeLineInput[]): RecipeLine[] {
  if (lines.length > MAX_RECIPE_LINES) {
    throw new DomainError(
      'TOO_MANY_LINES',
      `Uma ficha técnica pode ter até ${String(MAX_RECIPE_LINES)} insumos.`,
      'VALIDATION',
    );
  }
  const seen = new Set<Id>();
  return lines.map((line) => {
    if (seen.has(line.ingredientId)) {
      throw new DomainError(
        'DUPLICATE_INGREDIENT',
        'O mesmo insumo aparece duas vezes na ficha. Junte as quantidades numa linha só.',
        'VALIDATION',
      );
    }
    seen.add(line.ingredientId);
    const quantity = parseQuantityText(line.quantity);
    if (quantity === null || quantity === 0) {
      throw new DomainError(
        'INVALID_QUANTITY',
        'Informe uma quantidade maior que zero, com até 3 casas decimais (ex.: 150 ou 0,5).',
        'VALIDATION',
      );
    }
    return { ingredientId: line.ingredientId, quantity };
  });
}

/** As duas fichas são iguais? (mesmos insumos e quantidades, em qualquer ordem) — RN-REC-03. */
export function sameLines(a: readonly RecipeLine[], b: readonly RecipeLine[]): boolean {
  const key = (lines: readonly RecipeLine[]) =>
    lines
      .map((line) => `${line.ingredientId}:${String(line.quantity)}`)
      .sort()
      .join('|');
  return key(a) === key(b);
}

/**
 * Margem em DÉCIMOS de ponto percentual (RN-REC-04): 3200 de preço e 680 de custo → 788 (78,8%).
 * Sem preço (ou preço zero) → null. Pode ser negativa (custo maior que o preço).
 */
export function marginTenths(priceCents: number | null, costCents: number): number | null {
  if (priceCents === null || priceCents <= 0) return null;
  return Number(divideRoundHalfUp(BigInt(priceCents - costCents) * 1000n, BigInt(priceCents)));
}

export interface SoldItem {
  /** Item do pedido (origem da baixa). */
  readonly originId: Id;
  /** Quantidade vendida, em milésimos (1 un = 1000). */
  readonly quantity: number;
  readonly productLines: readonly RecipeLine[];
  readonly modifiers: readonly {
    /** Quantidade do adicional POR unidade do item, em milésimos. */
    readonly quantity: number;
    readonly lines: readonly RecipeLine[];
  }[];
}

/**
 * Consumo de itens vendidos (RN-REC-06): ficha do produto × quantidade + ficha de cada adicional ×
 * quantidade do adicional × quantidade do item. Somado por (item, insumo) e arredondado a milésimos
 * UMA vez (half-up), com inteiros exatos.
 */
export function expandConsumption(
  items: readonly SoldItem[],
): { originId: Id; ingredientId: Id; quantity: number }[] {
  const result: { originId: Id; ingredientId: Id; quantity: number }[] = [];
  for (const item of items) {
    // Em 10⁻⁹ da unidade base: milésimos × milésimos × milésimos
    const totals = new Map<Id, bigint>();
    const add = (ingredientId: Id, amount: bigint) => {
      totals.set(ingredientId, (totals.get(ingredientId) ?? 0n) + amount);
    };
    for (const line of item.productLines) {
      add(line.ingredientId, BigInt(line.quantity) * BigInt(item.quantity) * 1000n);
    }
    for (const extra of item.modifiers) {
      for (const line of extra.lines) {
        add(
          line.ingredientId,
          BigInt(line.quantity) * BigInt(extra.quantity) * BigInt(item.quantity),
        );
      }
    }
    for (const [ingredientId, amount] of totals) {
      const quantity = Number(divideRoundHalfUp(amount, 1_000_000n));
      if (quantity > 0) result.push({ originId: item.originId, ingredientId, quantity });
    }
  }
  return result;
}
