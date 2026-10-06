import { DomainError } from '@/shared/kernel';

// Regras puras do caixa (docs/modules/cashier.md §3). Valores em centavos inteiros (ADR-0003).

export const PAYMENT_METHODS = [
  'DINHEIRO',
  'PIX',
  'CARTAO_CREDITO',
  'CARTAO_DEBITO',
  'OUTRO',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Readonly<Record<PaymentMethod, string>> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO_CREDITO: 'Cartão de crédito',
  CARTAO_DEBITO: 'Cartão de débito',
  OUTRO: 'Outro',
};

export type CashMovementType = 'VENDA' | 'SANGRIA' | 'SUPRIMENTO' | 'AJUSTE' | 'ESTORNO';
export type CashSessionStatus = 'ABERTA' | 'FECHADA';

/** R$ 100.000,00 — fundo de troco, sangria e suprimento. */
export const MAX_CASH_CENTS = 10_000_000;

const rule = (code: string, message: string) => new DomainError(code, message, 'BUSINESS_RULE');

export const cashErrors = {
  storeNotFound: () => new DomainError('STORE_NOT_FOUND', 'Loja não encontrada.', 'NOT_FOUND'),
  sessionNotFound: () =>
    new DomainError('CASH_SESSION_NOT_FOUND', 'Caixa não encontrado.', 'NOT_FOUND'),
  terminalRequired: () =>
    rule(
      'TERMINAL_REQUIRED',
      'Este aparelho não é um terminal de caixa. Peça ao gerente para vinculá-lo em Administração → Terminais.',
    ),
  alreadyOpen: () =>
    new DomainError('CASH_ALREADY_OPEN', 'Já existe um caixa aberto neste terminal.', 'CONFLICT'),
  limitReached: () =>
    rule('CASH_LIMIT_REACHED', 'A loja já tem o número máximo de caixas abertos.'),
  notOpen: () => rule('CASH_NOT_OPEN', 'Abra o caixa deste terminal antes.'),
  closed: () => new DomainError('CASH_SESSION_CLOSED', 'Este caixa foi fechado.', 'CONFLICT'),
  concurrent: () =>
    new DomainError(
      'CONCURRENT_MODIFICATION',
      'Outra pessoa alterou este caixa. Recarregue a página.',
      'CONFLICT',
    ),
};

const invalidAmount = () =>
  new DomainError('INVALID_CASH_AMOUNT', 'Informe um valor válido (ex.: 150,00).', 'VALIDATION');

/** Fundo de troco: de R$ 0,00 a R$ 100.000,00. */
export function openingAmount(cents: number | null): number {
  if (cents === null || !Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CASH_CENTS) {
    throw invalidAmount();
  }
  return cents;
}

/** Sangria e suprimento: maior que zero, até R$ 100.000,00. */
export function movementAmount(cents: number | null): number {
  if (cents === null || !Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CASH_CENTS) {
    throw invalidAmount();
  }
  return cents;
}

/** Motivo de sangria/suprimento: 3 a 200 caracteres. */
export function cashReason(input: string | null | undefined): string {
  const value = (input ?? '').trim().replace(/\s+/g, ' ');
  if (value.length < 3 || value.length > 200) {
    throw new DomainError(
      'CASH_REASON_REQUIRED',
      'Explique o motivo (3 a 200 caracteres).',
      'VALIDATION',
    );
  }
  return value;
}

export interface MovementTotal {
  readonly method: PaymentMethod;
  /** Soma COM SINAL das movimentações daquela forma (sangria e estorno são negativos). */
  readonly amountCents: number;
}

/**
 * Esperado por forma de pagamento (RN-CASH-05): dinheiro = fundo + movimentações em dinheiro
 * (vendas e suprimentos somam; sangrias e estornos subtraem); demais formas = soma das vendas
 * menos os estornos daquela forma.
 */
export function expectedByMethod(
  openingCents: number,
  totals: readonly MovementTotal[],
): Record<PaymentMethod, number> {
  const expected = Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 0])) as Record<
    PaymentMethod,
    number
  >;
  expected.DINHEIRO = openingCents;
  for (const total of totals) expected[total.method] += total.amountCents;
  return expected;
}

/**
 * Sangrias que levaram o dinheiro esperado da gaveta abaixo de zero (decisão I-3 da revisão da
 * Etapa 8): a sangria é aceita na hora — recusar revelaria o esperado — e o gerente vê na
 * conferência do fechamento. `movements` em ordem de acontecimento.
 */
export function sangriasAboveExpected<
  M extends { type: CashMovementType; paymentMethod: PaymentMethod; amountCents: number },
>(openingCents: number, movements: readonly M[]): M[] {
  let cash = openingCents;
  const flagged: M[] = [];
  for (const movement of movements) {
    if (movement.paymentMethod !== 'DINHEIRO') continue;
    cash += movement.amountCents;
    if (movement.type === 'SANGRIA' && cash < 0) flagged.push(movement);
  }
  return flagged;
}

/**
 * Recontagem (E10-6, opção C): o dinheiro informado não bate e ainda não houve recontagem → o
 * sistema pede para contar de novo SEM dizer o valor. Só uma vez por caixa: na segunda o caixa
 * fecha (com várias tentativas daria para descobrir o esperado por tentativa e erro).
 */
export function needsRecount(lines: readonly CountLine[], firstCashCount: number | null): boolean {
  const cash = lines.find((line) => line.method === 'DINHEIRO');
  return firstCashCount === null && cash !== undefined && cash.differenceCents !== 0;
}

/** Cédulas e moedas do real, em centavos (contador do fechamento — E10-6, opção A). */
export const DENOMINATIONS = [
  { cents: 20_000, label: 'R$ 200', kind: 'cédula' },
  { cents: 10_000, label: 'R$ 100', kind: 'cédula' },
  { cents: 5_000, label: 'R$ 50', kind: 'cédula' },
  { cents: 2_000, label: 'R$ 20', kind: 'cédula' },
  { cents: 1_000, label: 'R$ 10', kind: 'cédula' },
  { cents: 500, label: 'R$ 5', kind: 'cédula' },
  { cents: 200, label: 'R$ 2', kind: 'cédula' },
  { cents: 100, label: 'R$ 1', kind: 'moeda' },
  { cents: 50, label: 'R$ 0,50', kind: 'moeda' },
  { cents: 25, label: 'R$ 0,25', kind: 'moeda' },
  { cents: 10, label: 'R$ 0,10', kind: 'moeda' },
  { cents: 5, label: 'R$ 0,05', kind: 'moeda' },
] as const;

/** Soma da contagem por cédula/moeda; quantidade inválida (negativa, fração, vazia) conta como 0. */
export function sumDenominations(counts: Readonly<Record<number, number>>): number {
  return DENOMINATIONS.reduce((sum, { cents }) => {
    const quantity = counts[cents] ?? 0;
    return Number.isSafeInteger(quantity) && quantity > 0 ? sum + quantity * cents : sum;
  }, 0);
}

export interface CountLine {
  readonly method: PaymentMethod;
  readonly expectedCents: number;
  readonly declaredCents: number | null;
  readonly differenceCents: number | null;
}

/**
 * Fechamento cego (RN-CASH-06, Q-16): dinheiro informado é obrigatório; as outras formas são
 * opcionais. Uma linha por forma que teve movimento ou foi informada (dinheiro sempre).
 */
export function blindCount(
  expected: Record<PaymentMethod, number>,
  declared: Partial<Record<PaymentMethod, number | null>>,
): CountLine[] {
  const cash = declared.DINHEIRO;
  if (cash === undefined || cash === null) {
    throw new DomainError(
      'CASH_COUNT_REQUIRED',
      'Informe quanto há em dinheiro na gaveta.',
      'VALIDATION',
    );
  }
  const lines: CountLine[] = [];
  for (const method of PAYMENT_METHODS) {
    const value = declared[method] ?? null;
    if (
      value !== null &&
      (!Number.isSafeInteger(value) || value < 0 || value > MAX_CASH_CENTS * 10)
    ) {
      throw invalidAmount();
    }
    if (method !== 'DINHEIRO' && value === null && expected[method] === 0) continue;
    lines.push({
      method,
      expectedCents: expected[method],
      declaredCents: value,
      differenceCents: value === null ? null : value - expected[method],
    });
  }
  return lines;
}
