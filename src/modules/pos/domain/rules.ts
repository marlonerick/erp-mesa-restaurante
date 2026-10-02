import { DomainError, divideRoundHalfUp } from '@/shared/kernel';

// Regras puras do PDV (docs/modules/pos.md §3). Centavos inteiros e pontos-base (ADR-0003):
// todo arredondamento é half-up e acontece uma vez, no fim de cada conta.

export type DiscountMode = 'VALOR' | 'PERCENTUAL';

const rule = (code: string, message: string) => new DomainError(code, message, 'BUSINESS_RULE');

export const posErrors = {
  storeNotFound: () => new DomainError('STORE_NOT_FOUND', 'Loja não encontrada.', 'NOT_FOUND'),
  itemNotFound: () => new DomainError('ORDER_ITEM_NOT_FOUND', 'Item não encontrado.', 'NOT_FOUND'),
  paymentNotFound: () =>
    new DomainError('PAYMENT_NOT_FOUND', 'Pagamento não encontrado.', 'NOT_FOUND'),
  orderNotOpen: () => rule('ORDER_NOT_OPEN', 'Esta conta não está mais aberta.'),
  pendingItems: () => rule('PENDING_ITEMS', 'Envie ou remova os itens ainda não enviados.'),
  paymentsStarted: () =>
    rule('PAYMENTS_STARTED', 'Esta conta já tem pagamento. Cancele os pagamentos antes.'),
  exceedsBalance: () => rule('PAYMENT_EXCEEDS_BALANCE', 'O valor passa do que falta pagar.'),
  itemsExceedBalance: () =>
    rule('ITEMS_EXCEED_BALANCE', 'Os itens marcados passam do que falta pagar. Receba por valor.'),
  notFree: () => rule('BILL_NOT_FREE', 'Esta conta tem valor a pagar.'),
  nothingToClose: () =>
    rule('BILL_EMPTY', 'Esta conta não tem itens com valor: cancele a conta na comanda.'),
  tenderedTooLow: () =>
    rule('TENDERED_TOO_LOW', 'O dinheiro recebido é menor que a parte destes itens.'),
  nothingToPay: () => rule('NOTHING_TO_PAY', 'Esta conta não tem valor a pagar.'),
  itemAlreadyPaid: () => rule('ITEM_ALREADY_PAID', 'Um dos itens já foi pago em outra parte.'),
  itemCancelled: () => rule('ITEM_ALREADY_CANCELLED', 'Este item já foi cancelado.'),
  discountTooHigh: () => rule('DISCOUNT_TOO_HIGH', 'O desconto passa do valor.'),
  noServiceFee: () => rule('NO_SERVICE_FEE', 'Pedido de balcão não tem taxa de serviço.'),
  alreadyCancelled: () => rule('PAYMENT_ALREADY_CANCELLED', 'Este pagamento já foi cancelado.'),
};

const invalidAmount = () =>
  new DomainError('INVALID_PAYMENT_AMOUNT', 'Informe um valor válido (ex.: 50,00).', 'VALIDATION');

/** Limite de um pagamento: R$ 1.000.000,00. */
const MAX_PAYMENT_CENTS = 100_000_000;

export function paymentAmount(cents: number | null): number {
  if (cents === null || !Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_PAYMENT_CENTS) {
    throw invalidAmount();
  }
  return cents;
}

const clean = (input: string | null | undefined) => (input ?? '').trim().replace(/\s+/g, ' ');

/** Motivo de desconto, taxa ou cancelamento: 3 a 200 caracteres. */
export function reasonText(input: string | null | undefined, code: string): string {
  const value = clean(input);
  if (value.length < 3 || value.length > 200) {
    throw new DomainError(code, 'Explique o motivo (3 a 200 caracteres).', 'VALIDATION');
  }
  return value;
}

/** Referência opcional do pagamento (NSU, código do PIX): até 60 caracteres. */
export function paymentReference(input: string | null | undefined): string | null {
  const value = clean(input);
  if (value === '') return null;
  if (value.length > 60) {
    throw new DomainError(
      'INVALID_PAYMENT_REFERENCE',
      'A referência tem até 60 caracteres.',
      'VALIDATION',
    );
  }
  return value;
}

/** "12,5" ou "10" (%) → pontos-base (1250, 1000); até 2 casas, de 0 a 100. */
export function parsePercent(text: string): number {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim().replace('%', '').trim());
  const bp = match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : NaN;
  if (!Number.isInteger(bp) || bp < 0 || bp > 10_000) {
    throw new DomainError(
      'INVALID_DISCOUNT',
      'Informe um percentual de 0 a 100, com até 2 casas (ex.: 10 ou 12,5).',
      'VALIDATION',
    );
  }
  return bp;
}

/** Aplica pontos-base com arredondamento half-up. */
export const applyBp = (cents: number, bp: number): number =>
  Number(divideRoundHalfUp(BigInt(cents) * BigInt(bp), 10_000n));

// ---- Conta (RN-POS-02, RN-POS-03) ----

export interface BillItem {
  readonly id: string;
  readonly status: string;
  readonly unitPriceCents: number;
  readonly modifiersCents: number;
  readonly quantity: number;
  readonly discountCents: number;
}

export interface BillOrder {
  readonly type: 'MESA' | 'BALCAO';
  readonly serviceFeeBp: number;
  readonly serviceFeeWaived: boolean;
  readonly discountCents: number;
  readonly paidCents: number;
}

export interface BillTotals {
  /** Σ (preço + adicionais) × quantidade dos itens não cancelados. */
  readonly itemsCents: number;
  readonly itemDiscountsCents: number;
  /** itens − descontos nos itens. */
  readonly subtotalCents: number;
  readonly orderDiscountCents: number;
  /** subtotal − desconto na conta: base da taxa (Q-06: depois dos descontos). */
  readonly baseCents: number;
  /** Percentual que vale nesta conta (0 no balcão ou com a taxa retirada). */
  readonly serviceFeeBp: number;
  readonly serviceFeeCents: number;
  readonly totalCents: number;
  readonly paidCents: number;
  readonly balanceCents: number;
}

export const lineGross = (item: BillItem): number =>
  (item.unitPriceCents + item.modifiersCents) * item.quantity;
export const lineNet = (item: BillItem): number => lineGross(item) - item.discountCents;

/** Taxa que vale: balcão não tem (Q-06); retirada com autorização = 0 (RN-POS-06). */
export const effectiveFeeBp = (order: BillOrder): number =>
  order.type === 'BALCAO' || order.serviceFeeWaived ? 0 : order.serviceFeeBp;

export function computeBill(order: BillOrder, items: readonly BillItem[]): BillTotals {
  const live = items.filter((item) => item.status !== 'CANCELADO');
  const itemsCents = live.reduce((sum, item) => sum + lineGross(item), 0);
  const itemDiscountsCents = live.reduce((sum, item) => sum + item.discountCents, 0);
  const subtotalCents = itemsCents - itemDiscountsCents;
  // Um item cancelado depois do desconto da conta não deixa a base negativa
  const orderDiscountCents = Math.min(order.discountCents, subtotalCents);
  const baseCents = subtotalCents - orderDiscountCents;
  const serviceFeeBp = effectiveFeeBp(order);
  const serviceFeeCents = applyBp(baseCents, serviceFeeBp);
  const totalCents = baseCents + serviceFeeCents;
  return {
    itemsCents,
    itemDiscountsCents,
    subtotalCents,
    orderDiscountCents,
    baseCents,
    serviceFeeBp,
    serviceFeeCents,
    totalCents,
    paidCents: order.paidCents,
    balanceCents: totalCents - order.paidCents,
  };
}

// ---- Desconto (RN-POS-05) ----

/** Desconto em centavos a partir do que a pessoa digitou (valor ou percentual da base). */
export function discountFromInput(mode: DiscountMode, value: number, baseCents: number): number {
  const cents = mode === 'PERCENTUAL' ? applyBp(baseCents, value) : value;
  if (!Number.isSafeInteger(cents) || cents < 0) throw invalidAmount();
  if (cents > baseCents) throw posErrors.discountTooHigh();
  return cents;
}

/** O desconto passa do limite do perfil? (sem arredondar: desconto/base > limite) */
export const exceedsLimit = (discountCents: number, baseCents: number, limitBp: number): boolean =>
  discountCents > 0 && BigInt(discountCents) * 10_000n > BigInt(limitBp) * BigInt(baseCents);

// ---- Pagamento (RN-POS-09, RN-POS-13) ----

/** Dinheiro: o que abate da conta e o troco (troco só no dinheiro). */
export function cashSplit(tenderedCents: number, balanceCents: number) {
  const applied = Math.min(tenderedCents, balanceCents);
  return { appliedCents: applied, changeCents: tenderedCents - applied };
}

/**
 * Parte de cada item escolhido na conta (divisão por itens — RN-POS-13): linha com o desconto do
 * item, menos a parte proporcional do desconto da conta, mais a taxa sobre o que sobrou.
 */
export function itemShares(
  totals: BillTotals,
  selected: readonly BillItem[],
): { itemId: string; amountCents: number }[] {
  return selected.map((item) => {
    const net = lineNet(item);
    const discountShare =
      totals.subtotalCents === 0
        ? 0
        : Number(
            divideRoundHalfUp(
              BigInt(totals.orderDiscountCents) * BigInt(net),
              BigInt(totals.subtotalCents),
            ),
          );
    const base = net - discountShare;
    return { itemId: item.id, amountCents: base + applyBp(base, totals.serviceFeeBp) };
  });
}

/**
 * Ajusta as partes dos itens para somarem exatamente `target` (proporcional, sem parte negativa;
 * os centavos que sobram vão para as primeiras). Usado quando os itens marcados são todos os que
 * faltam: cobra o que falta, sem deixar centavo de arredondamento (achado I-1 e S-3 da revisão).
 */
export function fitShares<T extends { amountCents: number }>(
  shares: readonly T[],
  target: number,
): T[] {
  const total = shares.reduce((sum, share) => sum + share.amountCents, 0);
  if (shares.length === 0 || total === target) return [...shares];
  // Partes todas zeradas (itens com 100% de desconto): o valor vai para a primeira
  if (total === 0) {
    return shares.map((share, index) => ({ ...share, amountCents: index === 0 ? target : 0 }));
  }
  const scaled = shares.map((share) =>
    Number((BigInt(share.amountCents) * BigInt(target)) / BigInt(total)),
  );
  // O arredondamento para baixo deixa menos centavos que partes: 1 para cada uma das primeiras
  let rest = target - scaled.reduce((sum, value) => sum + value, 0);
  return shares.map((share, index) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { ...share, amountCents: (scaled[index] ?? 0) + extra };
  });
}

/** Divisão por pessoas (RN-POS-13): N partes iguais; os centavos que sobram vão para as primeiras. */
export function splitEvenly(balanceCents: number, people: number): number[] {
  if (!Number.isInteger(people) || people < 1 || people > 50) {
    throw new DomainError('INVALID_SPLIT', 'Divida entre 1 e 50 pessoas.', 'VALIDATION');
  }
  const base = Math.floor(balanceCents / people);
  const remainder = balanceCents % people;
  return Array.from({ length: people }, (_, index) => base + (index < remainder ? 1 : 0));
}
