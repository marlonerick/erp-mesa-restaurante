import { DomainError, type Id } from '@/shared/kernel';

// Regras puras da comanda (docs/modules/orders.md §3). Valores em centavos inteiros (ADR-0003).

export const ORDER_ITEM_STATUSES = [
  'PENDENTE',
  'ENVIADO',
  'EM_PREPARO',
  'PRONTO',
  'ENTREGUE',
  'CANCELADO',
] as const;
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];
export type OrderStatus = 'ABERTO' | 'FECHADO' | 'CANCELADO';
export type OrderType = 'MESA' | 'BALCAO';

export const ITEM_STATUS_LABEL: Readonly<Record<OrderItemStatus, string>> = {
  PENDENTE: 'Não enviado',
  ENVIADO: 'Na cozinha',
  EM_PREPARO: 'Preparando',
  PRONTO: 'Pronto',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

export const MAX_ITEMS_PER_ORDER = 300;
/** Mesas juntadas numa conta (achado I-1): 12 números de até 10 letras + " + " cabem em 160. */
export const MAX_TABLES_PER_ORDER = 12;
export const MAX_ITEM_QUANTITY = 99;
export const ITEM_NOTES_MAX_LENGTH = 140;
export const MERGED_REASON = 'MESCLADA';

const clean = (input: string | null | undefined) => (input ?? '').trim().replace(/\s+/g, ' ');

/** Nome do cliente no balcão (Q-04): 2 a 40 caracteres. */
export function counterLabel(input: string): string {
  const value = clean(input);
  if (value.length < 2 || value.length > 40) {
    throw new DomainError(
      'INVALID_COUNTER_LABEL',
      'Informe um nome de 2 a 40 caracteres.',
      'VALIDATION',
    );
  }
  return value;
}

/** Pessoas na mesa (E6-7): opcional, de 1 a 99. */
export function guestsCount(input: number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (!Number.isInteger(input) || input < 1 || input > 99) {
    throw new DomainError('INVALID_GUESTS', 'Informe de 1 a 99 pessoas.', 'VALIDATION');
  }
  return input;
}

/** Quantidade do item (E6-3): inteiro de 1 a 99. */
export function itemQuantity(input: number): number {
  if (!Number.isInteger(input) || input < 1 || input > MAX_ITEM_QUANTITY) {
    throw new DomainError(
      'INVALID_ITEM_QUANTITY',
      'Informe uma quantidade de 1 a 99.',
      'VALIDATION',
    );
  }
  return input;
}

/** Observação do item ("sem cebola"): opcional, até 140 caracteres. */
export function itemNotes(input: string | null | undefined): string | null {
  const value = clean(input);
  if (value === '') return null;
  if (value.length > ITEM_NOTES_MAX_LENGTH) {
    throw new DomainError(
      'INVALID_ITEM_NOTES',
      'A observação tem até 140 caracteres.',
      'VALIDATION',
    );
  }
  return value;
}

/** Motivo do cancelamento de item (RN-ORD-12): 3 a 200 caracteres. */
export function cancelReason(input: string | null | undefined): string {
  const value = clean(input);
  if (value.length < 3 || value.length > 200) {
    throw new DomainError(
      'CANCEL_REASON_REQUIRED',
      'Explique o motivo (3 a 200 caracteres).',
      'VALIDATION',
    );
  }
  return value;
}

/** Motivo opcional do cancelamento da conta (RN-ORD-20). */
export function optionalReason(input: string | null | undefined): string | null {
  const value = clean(input);
  if (value === '') return null;
  return cancelReason(value);
}

// ---- Adicionais (RN-ORD-06) ----

export interface ModifierGroupRule {
  readonly id: Id;
  readonly name: string;
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly options: readonly {
    readonly id: Id;
    readonly name: string;
    readonly priceDeltaCents: number;
  }[];
}

export interface ChosenModifier {
  readonly modifierId: Id;
  readonly name: string;
  readonly priceDeltaCents: number;
}

const invalidModifiers = (message: string) =>
  new DomainError('INVALID_MODIFIERS', message, 'VALIDATION');

/**
 * Confere as escolhas contra os grupos do produto: só opções dos grupos, cada uma uma vez, e cada
 * grupo entre o mínimo e o máximo. Devolve as escolhas na ordem dos grupos (nome e preço atuais).
 */
export function chooseModifiers(
  groups: readonly ModifierGroupRule[],
  chosenIds: readonly Id[],
): ChosenModifier[] {
  if (new Set(chosenIds).size !== chosenIds.length) {
    throw invalidModifiers('Confira os adicionais: cada opção pode ser escolhida uma vez.');
  }
  const wanted = new Set(chosenIds);
  const result: ChosenModifier[] = [];
  for (const group of groups) {
    const picked = group.options.filter((option) => wanted.has(option.id));
    if (picked.length < group.minSelect || picked.length > group.maxSelect) {
      const range =
        group.minSelect === group.maxSelect
          ? `${String(group.minSelect)} escolha${group.minSelect === 1 ? '' : 's'}`
          : `de ${String(group.minSelect)} a ${String(group.maxSelect)} escolhas`;
      throw invalidModifiers(`Confira os adicionais: ${group.name} pede ${range}.`);
    }
    for (const option of picked) {
      wanted.delete(option.id);
      result.push({
        modifierId: option.id,
        name: option.name,
        priceDeltaCents: option.priceDeltaCents,
      });
    }
  }
  if (wanted.size > 0) {
    throw invalidModifiers('Confira os adicionais: há uma opção que não vale para este produto.');
  }
  return result;
}

// ---- Valores (RN-ORD-15) ----

export interface PricedItem {
  readonly unitPriceCents: number;
  readonly modifiersCents: number;
  readonly quantity: number;
  readonly status: OrderItemStatus;
}

/** Total da linha: (preço unitário + adicionais) × quantidade. */
export const lineTotal = (item: Omit<PricedItem, 'status'>): number =>
  (item.unitPriceCents + item.modifiersCents) * item.quantity;

/** Subtotal da conta (E6-1): itens não cancelados. */
export function subtotal(items: readonly PricedItem[]): number {
  return items.reduce(
    (sum, item) => (item.status === 'CANCELADO' ? sum : sum + lineTotal(item)),
    0,
  );
}

// ---- Cancelamento (RN-ORD-12, RN-ORD-13) ----

/** Item já foi para a cozinha (ou ficou pronto) e ainda não foi cancelado. */
export const isSent = (status: OrderItemStatus) => status !== 'PENDENTE' && status !== 'CANCELADO';

/**
 * O que acontece com o estoque de um item cancelado: volta ao estoque se a cozinha não começou (ou
 * se é item sem preparo ainda não entregue — a lata está fechada); senão, o consumo vira perda.
 */
export function cancelStockEffect(item: {
  readonly status: OrderItemStatus;
  readonly requiresPreparation: boolean;
}): 'ESTORNO' | 'PERDA' {
  if (item.status === 'ENVIADO') return 'ESTORNO';
  if (!item.requiresPreparation && item.status === 'PRONTO') return 'ESTORNO';
  return 'PERDA';
}
