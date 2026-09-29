import { DomainError, type Id, normalizeName, parseMoneyText } from '@/shared/kernel';

// Regras puras do cardápio (docs/modules/catalog.md §3).

export const categoryName = (input: string) => normalizeName(input, 2, 60);
export const productName = (input: string) => normalizeName(input, 2, 80);
export const modifierGroupName = (input: string) => normalizeName(input, 2, 60);
export const modifierName = (input: string) => normalizeName(input, 1, 60);

const SKU = /^[A-Z0-9._-]{1,30}$/;

/** Código opcional (E4-4): vazio → null; senão maiúsculas, 1 a 30 caracteres (RN-CAT-04). */
export function normalizeSku(input: string | null): string | null {
  if (input === null || input.trim() === '') return null;
  const sku = input.trim().toUpperCase();
  if (!SKU.test(sku)) {
    throw new DomainError(
      'INVALID_SKU',
      'Use de 1 a 30 letras, números, hífen, ponto ou sublinhado.',
      'VALIDATION',
    );
  }
  return sku;
}

export const DESCRIPTION_MAX_LENGTH = 300;

/** Descrição opcional, até 300 caracteres; vazia → null. */
export function normalizeDescription(input: string | null): string | null {
  if (input === null) return null;
  const description = input.trim();
  if (description === '') return null;
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    throw new DomainError(
      'INVALID_DESCRIPTION',
      `A descrição pode ter até ${String(DESCRIPTION_MAX_LENGTH)} caracteres.`,
      'VALIDATION',
    );
  }
  return description;
}

/** Preço na loja: R$ 0,00 a R$ 99.999,99 (RN-CAT-07). */
export const MAX_PRICE_CENTS = 9_999_999;
/** Preço extra do adicional: R$ 0,00 a R$ 9.999,99 (RN-CAT-12). */
export const MAX_MODIFIER_PRICE_CENTS = 999_999;

const invalidPrice = () =>
  new DomainError(
    'INVALID_PRICE',
    'Informe um valor entre R$ 0,00 e R$ 99.999,99 (ex.: 32,50).',
    'VALIDATION',
  );
const invalidModifierPrice = () =>
  new DomainError(
    'INVALID_MODIFIER_PRICE',
    'Informe um valor entre R$ 0,00 e R$ 9.999,99 (ex.: 5,00).',
    'VALIDATION',
  );

function inRange(cents: number, max: number, error: () => DomainError): number {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > max) throw error();
  return cents;
}

export const validatePriceCents = (cents: number) => inRange(cents, MAX_PRICE_CENTS, invalidPrice);
export const validateModifierPriceCents = (cents: number) =>
  inRange(cents, MAX_MODIFIER_PRICE_CENTS, invalidModifierPrice);

/** Texto da tela ("32,50") → centavos do preço na loja (RN-CAT-08). */
export function parsePriceText(text: string): number {
  const cents = parseMoneyText(text);
  if (cents === null) throw invalidPrice();
  return validatePriceCents(cents);
}

/** Texto da tela → centavos do adicional; vazio = R$ 0,00 (ex.: "Ao ponto"). */
export function parseModifierPriceText(text: string): number {
  if (text.trim() === '') return 0;
  const cents = parseMoneyText(text);
  if (cents === null) throw invalidModifierPrice();
  return validateModifierPriceCents(cents);
}

export const MAX_SELECT_LIMIT = 10;

/** Mínimo 0..máximo; máximo 1..10 (RN-CAT-11). */
export function validateSelectionLimits(minSelect: number, maxSelect: number) {
  const valid =
    Number.isInteger(minSelect) &&
    Number.isInteger(maxSelect) &&
    maxSelect >= 1 &&
    maxSelect <= MAX_SELECT_LIMIT &&
    minSelect >= 0 &&
    minSelect <= maxSelect;
  if (!valid) {
    throw new DomainError(
      'INVALID_SELECTION_LIMITS',
      `O máximo vai de 1 a ${String(MAX_SELECT_LIMIT)} e o mínimo, de 0 até o máximo.`,
      'VALIDATION',
    );
  }
  return { minSelect, maxSelect };
}

export const MAX_MODIFIER_GROUPS_PER_PRODUCT = 10;

/** Limite da lista de produtos (cardápio do piloto: dezenas a poucas centenas); a tela avisa. */
export const PRODUCT_LIST_LIMIT = 500;

/** Grupos do produto sem repetição, até 10 (RN-CAT-06). */
export function validateModifierGroupIds(ids: readonly Id[]): Id[] {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_MODIFIER_GROUPS_PER_PRODUCT) {
    throw new DomainError(
      'TOO_MANY_MODIFIER_GROUPS',
      `Um produto pode ter até ${String(MAX_MODIFIER_GROUPS_PER_PRODUCT)} grupos de adicionais.`,
      'VALIDATION',
    );
  }
  return unique;
}

export type MoveDirection = 'UP' | 'DOWN';

/**
 * Nova ordem depois de subir/descer um item (RN-CAT-02): troca com o vizinho. Já no topo (ou no
 * fim) → mesma ordem. Item que não está na lista → null.
 */
export function moveInOrder<T>(items: readonly T[], item: T, direction: MoveDirection): T[] | null {
  const index = items.indexOf(item);
  if (index < 0) return null;
  const target = direction === 'UP' ? index - 1 : index + 1;
  const result = [...items];
  if (target < 0 || target >= items.length) return result;
  [result[index], result[target]] = [result[target] as T, result[index] as T];
  return result;
}

/** O mínimo do grupo cabe nas opções ativas? Se não, o produto não poderia ser lançado. */
export const selectionIsSatisfiable = (minSelect: number, activeOptions: number) =>
  minSelect <= activeOptions;
