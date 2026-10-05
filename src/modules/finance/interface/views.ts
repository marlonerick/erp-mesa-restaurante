import type { CashFlow, EntriesPage } from '../application/finance';
import type { CategoryRecord, EntryRecord } from '../application/ports';
import {
  FINANCE_STATUS_LABEL,
  FINANCE_TYPE_LABEL,
  type FinanceStatus,
  type FinanceType,
} from '../domain/rules';

// Dados prontos para as telas do financeiro (texto no lugar de Date; rótulos em português).

export interface EntryView {
  readonly id: string;
  readonly type: FinanceType;
  readonly typeLabel: string;
  readonly categoryName: string;
  readonly description: string;
  readonly amountCents: number;
  readonly competenceDate: string;
  readonly dueDate: string | null;
  readonly paidDate: string | null;
  readonly status: FinanceStatus;
  readonly statusLabel: string;
  /** Receita automática do fechamento do caixa: não é paga nem cancelada pela tela. */
  readonly automatic: boolean;
  readonly paymentMethod: string | null;
  readonly createdByName: string | null;
  readonly cancelReason: string | null;
  readonly version: number;
}

export interface CategoryView {
  readonly id: string;
  readonly type: FinanceType;
  readonly name: string;
  readonly system: boolean;
  readonly active: boolean;
  readonly version: number;
}

function toEntryView(row: EntryRecord & { readonly createdByName?: string | null }): EntryView {
  return {
    id: row.id,
    type: row.type,
    typeLabel: FINANCE_TYPE_LABEL[row.type],
    categoryName: row.categoryName,
    description: row.description,
    amountCents: row.amountCents,
    competenceDate: row.competenceDate,
    dueDate: row.dueDate,
    paidDate: row.paidDate,
    status: row.status,
    statusLabel: FINANCE_STATUS_LABEL[row.status],
    automatic: row.source === 'CAIXA',
    paymentMethod: row.paymentMethod,
    createdByName: row.createdByName ?? null,
    cancelReason: row.cancelReason,
    version: row.version,
  };
}

export function toEntriesView(page: EntriesPage) {
  return {
    rows: page.rows.map(toEntryView),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
  };
}

export type EntriesView = ReturnType<typeof toEntriesView>;

export function toCashFlowView(flow: CashFlow) {
  return {
    from: flow.from,
    to: flow.to,
    today: flow.today,
    days: flow.days,
    inflowCents: flow.inflowCents,
    outflowCents: flow.outflowCents,
    upcoming: flow.upcoming.map((entry) => ({
      ...toEntryView(entry),
      overdue: entry.dueDate !== null && entry.dueDate < flow.today,
    })),
  };
}

export type CashFlowView = ReturnType<typeof toCashFlowView>;

export const toCategoryView = (category: CategoryRecord): CategoryView => ({
  id: category.id,
  type: category.type,
  name: category.name,
  system: category.systemCode !== null,
  active: category.active,
  version: category.version,
});
