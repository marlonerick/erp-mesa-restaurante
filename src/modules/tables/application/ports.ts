import type { StoreInfo } from '@/modules/organizations';
import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id } from '@/shared/kernel';
import type { TableStatus } from '../domain/rules';

export interface TableRecord {
  readonly id: Id;
  readonly storeId: Id;
  readonly number: string;
  readonly area: string | null;
  readonly seats: number;
  readonly status: TableStatus;
  readonly currentOrderId: Id | null;
  readonly active: boolean;
  readonly version: number;
}

export interface TableData {
  readonly number: string;
  readonly area: string | null;
  readonly seats: number;
  readonly active: boolean;
}

/**
 * Toda busca por id exige a LOJA (ADR-0009): de outra loja = inexistente. Updates de cadastro são
 * condicionais à versão lida (ADR-0008).
 */
export interface TablesRepository {
  listTables(
    tx: Transaction,
    filter: { storeId: Id; includeInactive: boolean },
  ): Promise<TableRecord[]>;
  findTable(
    tx: Transaction,
    scope: { storeId: Id; tableId: Id },
    options?: { forUpdate?: boolean },
  ): Promise<TableRecord | null>;
  /** Trava as mesas na ordem dos ids (evita deadlock — RN-ORD-22). */
  lockTables(tx: Transaction, storeId: Id, tableIds: readonly Id[]): Promise<TableRecord[]>;
  /** Mesas que apontam para a conta, travadas na ordem dos ids. */
  lockTablesOfOrder(tx: Transaction, storeId: Id, orderId: Id): Promise<TableRecord[]>;
  insertTable(tx: Transaction, input: TableData & { id: Id; storeId: Id }): Promise<void>;
  updateTable(tx: Transaction, id: Id, version: number, data: TableData): Promise<boolean>;
  /** Estado e conta (quem chama já travou as linhas). Incrementa a versão. */
  setState(
    tx: Transaction,
    ids: readonly Id[],
    state: { status: TableStatus; currentOrderId: Id | null },
  ): Promise<void>;
}

export interface TablesDependencies {
  readonly db: Database;
  readonly repo: TablesRepository;
  readonly findStore: (tx: Transaction, storeId: Id) => Promise<StoreInfo | null>;
}
