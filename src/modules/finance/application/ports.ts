import type { StoreInfo } from '@/modules/organizations';
import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id } from '@/shared/kernel';
import type { FinanceSource, FinanceStatus, FinanceType, PaidTotal } from '../domain/rules';

export type PaymentMethodCode = 'DINHEIRO' | 'PIX' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'OUTRO';

export interface CategoryRecord {
  readonly id: Id;
  readonly companyId: Id;
  readonly type: FinanceType;
  readonly name: string;
  readonly systemCode: string | null;
  readonly active: boolean;
  readonly version: number;
}

export interface EntryRecord {
  readonly id: Id;
  readonly storeId: Id;
  readonly type: FinanceType;
  readonly categoryId: Id;
  readonly categoryName: string;
  readonly description: string;
  readonly amountCents: number;
  readonly competenceDate: string;
  readonly dueDate: string | null;
  readonly paidDate: string | null;
  readonly status: FinanceStatus;
  readonly source: FinanceSource;
  readonly paymentMethod: PaymentMethodCode | null;
  readonly createdBy: Id;
  readonly createdAt: Date;
  readonly cancelReason: string | null;
  readonly version: number;
}

export interface NewEntry {
  readonly id: Id;
  readonly storeId: Id;
  readonly type: FinanceType;
  readonly categoryId: Id;
  readonly description: string;
  readonly amountCents: number;
  readonly competenceDate: string;
  readonly dueDate: string | null;
  readonly paidDate: string | null;
  readonly status: 'PREVISTO' | 'PAGO';
  readonly source: FinanceSource;
  readonly cashSessionId: Id | null;
  readonly paymentMethod: PaymentMethodCode | null;
  readonly createdBy: Id;
  readonly createdAt: Date;
}

export interface EntryFilter {
  readonly storeId: Id;
  readonly from: string;
  readonly to: string;
  readonly type: FinanceType | null;
  readonly status: FinanceStatus | null;
  readonly categoryId: Id | null;
}

/** Toda busca por id exige a loja (lançamento) ou a empresa (categoria) — ADR-0009. */
export interface FinanceRepository {
  /** Cria as categorias iniciais que faltam (idempotente — índice único). */
  ensureCategories(
    tx: Transaction,
    companyId: Id,
    categories: readonly { type: FinanceType; name: string; systemCode?: string }[],
  ): Promise<void>;
  listCategories(tx: Transaction, companyId: Id): Promise<CategoryRecord[]>;
  findCategory(
    tx: Transaction,
    scope: { companyId: Id; categoryId: Id },
  ): Promise<CategoryRecord | null>;
  findSystemCategory(tx: Transaction, companyId: Id, code: string): Promise<CategoryRecord | null>;
  insertCategory(
    tx: Transaction,
    category: { id: Id; companyId: Id; type: FinanceType; name: string },
  ): Promise<void>;
  /** false = versão diferente (outra pessoa alterou). */
  setCategoryActive(
    tx: Transaction,
    scope: { companyId: Id; categoryId: Id; version: number },
    active: boolean,
  ): Promise<boolean>;

  insertEntry(tx: Transaction, entry: NewEntry): Promise<void>;
  findEntry(
    tx: Transaction,
    scope: { storeId: Id; entryId: Id },
    options?: { forUpdate?: boolean },
  ): Promise<EntryRecord | null>;
  listEntries(
    tx: Transaction,
    filter: EntryFilter,
    page: { offset: number; limit: number },
  ): Promise<{ rows: EntryRecord[]; total: number }>;
  markPaid(tx: Transaction, scope: { storeId: Id; entryId: Id }, paidDate: string): Promise<void>;
  markCancelled(
    tx: Transaction,
    scope: { storeId: Id; entryId: Id },
    data: { by: Id; at: Date; reason: string },
  ): Promise<void>;
  /** Somas dos lançamentos PAGOS por dia de pagamento e tipo, no período. */
  paidTotals(
    tx: Transaction,
    scope: { storeId: Id; from: string; to: string },
  ): Promise<PaidTotal[]>;
  /** PREVISTOS com vencimento até `until` (inclui os vencidos), por vencimento. */
  upcoming(tx: Transaction, scope: { storeId: Id; until: string }): Promise<EntryRecord[]>;
}

/** O que o financeiro usa dos outros módulos (injetado — ADR-0014). */
export interface FinanceDependencies {
  readonly db: Database;
  readonly repo: FinanceRepository;
  readonly findStore: (tx: Transaction, storeId: Id) => Promise<StoreInfo | null>;
  /** Dia operacional atual da loja (ADR-0013). */
  readonly today: (
    tx: Transaction,
    scope: { organizationId: Id; storeId: Id },
    now: Date,
  ) => Promise<string>;
  readonly userNames: (tx: Transaction, ids: readonly Id[]) => Promise<Map<Id, string>>;
}
