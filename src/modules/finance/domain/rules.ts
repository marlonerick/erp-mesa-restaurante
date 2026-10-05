import { addDays, DomainError, parseLocalDate } from '@/shared/kernel';

// Regras puras do financeiro (docs/modules/finance.md §3). Centavos inteiros (ADR-0003).

export const FINANCE_TYPES = ['RECEITA', 'DESPESA'] as const;
export type FinanceType = (typeof FINANCE_TYPES)[number];
export type FinanceStatus = 'PREVISTO' | 'PAGO' | 'CANCELADO';
export type FinanceSource = 'MANUAL' | 'CAIXA';

export const FINANCE_TYPE_LABEL: Readonly<Record<FinanceType, string>> = {
  RECEITA: 'Receita',
  DESPESA: 'Despesa',
};
export const FINANCE_STATUS_LABEL: Readonly<Record<FinanceStatus, string>> = {
  PREVISTO: 'Previsto',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
};

/** Código da categoria das receitas automáticas do caixa (RN-FIN-03). */
export const SALES_CATEGORY_CODE = 'VENDAS';

/** Categorias criadas na primeira vez que a empresa usa o financeiro (E9-2). */
export const DEFAULT_CATEGORIES: readonly {
  readonly type: FinanceType;
  readonly name: string;
  readonly systemCode?: string;
}[] = [
  { type: 'RECEITA', name: 'Vendas', systemCode: SALES_CATEGORY_CODE },
  { type: 'RECEITA', name: 'Outras receitas' },
  { type: 'DESPESA', name: 'Insumos e fornecedores' },
  { type: 'DESPESA', name: 'Salários' },
  { type: 'DESPESA', name: 'Aluguel' },
  { type: 'DESPESA', name: 'Contas de consumo' },
  { type: 'DESPESA', name: 'Impostos e taxas' },
  { type: 'DESPESA', name: 'Manutenção' },
  { type: 'DESPESA', name: 'Outros' },
];

/** R$ 10.000.000,00. */
export const MAX_FINANCE_CENTS = 1_000_000_000;
/** Primeira data aceita em lançamentos. */
const MIN_DATE = '2000-01-01';
/** Despesas e receitas previstas mostradas no fluxo (RN-FIN-07). */
export const UPCOMING_DAYS = 30;
export const ENTRIES_PAGE_SIZE = 50;

const clean = (input: string | null | undefined) => (input ?? '').trim().replace(/\s+/g, ' ');

export function financeAmount(cents: number | null): number {
  if (cents === null || !Number.isSafeInteger(cents) || cents < 1 || cents > MAX_FINANCE_CENTS) {
    throw new DomainError(
      'INVALID_FINANCE_AMOUNT',
      'Informe um valor de R$ 0,01 a R$ 10.000.000,00.',
      'VALIDATION',
    );
  }
  return cents;
}

export function financeDescription(input: string | null | undefined): string {
  const value = clean(input);
  if (value.length < 3 || value.length > 120) {
    throw new DomainError(
      'INVALID_FINANCE_DESCRIPTION',
      'Descreva o lançamento (3 a 120 caracteres).',
      'VALIDATION',
    );
  }
  return value;
}

/** Data de lançamento: válida, de 2000-01-01 até um ano depois de hoje (dia operacional). */
export function financeDate(text: string, today: string): string {
  let date: string;
  try {
    date = parseLocalDate(text);
  } catch {
    throw invalidFinanceDate();
  }
  if (date < MIN_DATE || date > addDays(today, 366)) throw invalidFinanceDate();
  return date;
}

const invalidFinanceDate = () =>
  new DomainError(
    'INVALID_FINANCE_DATE',
    'Informe uma data válida (até um ano à frente).',
    'VALIDATION',
  );

export function categoryName(input: string | null | undefined): string {
  const value = clean(input);
  if (value.length < 2 || value.length > 60) {
    throw new DomainError(
      'INVALID_FINANCE_CATEGORY',
      'Dê um nome de 2 a 60 caracteres à categoria.',
      'VALIDATION',
    );
  }
  return value;
}

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

// ---- Fluxo de caixa (RN-FIN-07) ----

export interface PaidTotal {
  readonly date: string;
  readonly type: FinanceType;
  readonly amountCents: number;
}

export interface CashFlowDay {
  readonly date: string;
  readonly inflowCents: number;
  readonly outflowCents: number;
  /** Entradas − saídas do dia. */
  readonly netCents: number;
  /** Soma dos saldos do período até este dia. */
  readonly cumulativeCents: number;
}

/** Dias com movimento, em ordem, com saldo do dia e acumulado no período. */
export function cashFlowDays(totals: readonly PaidTotal[]): CashFlowDay[] {
  const byDay = new Map<string, { inflow: number; outflow: number }>();
  for (const total of totals) {
    const day = byDay.get(total.date) ?? { inflow: 0, outflow: 0 };
    if (total.type === 'RECEITA') day.inflow += total.amountCents;
    else day.outflow += total.amountCents;
    byDay.set(total.date, day);
  }
  let cumulative = 0;
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { inflow, outflow }]) => {
      cumulative += inflow - outflow;
      return {
        date,
        inflowCents: inflow,
        outflowCents: outflow,
        netCents: inflow - outflow,
        cumulativeCents: cumulative,
      };
    });
}
