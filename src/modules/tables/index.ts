// API pública do módulo Tables (Etapa 6 — docs/modules/tables.md).
import { getStore } from '@/modules/organizations';
import { type Database, getDatabase } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, RequestContext } from '@/shared/kernel';
import * as useCases from './application/tables';
import type { TableRecord, TablesDependencies } from './application/ports';
import { compareTables, type TableStatus } from './domain/rules';
import { tablesRepository as repo } from './infrastructure/tables-repository';

export type { TableRecord } from './application/ports';
export {
  DEFAULT_SEATS,
  IN_USE,
  TABLE_STATUS_LABEL,
  TABLE_STATUSES,
  type TableStatus,
  tablesLabel,
} from './domain/rules';
export const tableErrors = useCases.tableErrors;

// ---- Usado pelo Orders, NA TRANSAÇÃO dele (a loja já foi conferida por quem chama) ----

/** Mesas ativas da loja na ordem do mapa (RN-TAB-07). */
export async function listActiveTables(tx: Transaction, storeId: Id): Promise<TableRecord[]> {
  const rows = await repo.listTables(tx, { storeId, includeInactive: false });
  return rows.sort(compareTables);
}

/** Trava as mesas da loja na ordem dos ids (RN-ORD-22). Mesa de outra loja não vem. */
export const lockTables = (tx: Transaction, storeId: Id, tableIds: readonly Id[]) =>
  repo.lockTables(tx, storeId, tableIds);

/** Mesas ligadas à conta, travadas. */
export const lockTablesOfOrder = (tx: Transaction, storeId: Id, orderId: Id) =>
  repo.lockTablesOfOrder(tx, storeId, orderId);

/** Muda estado e conta das mesas já travadas (RN-TAB-04). */
export const setTablesState = (
  tx: Transaction,
  tableIds: readonly Id[],
  state: { status: TableStatus; currentOrderId: Id | null },
) => repo.setState(tx, tableIds, state);

// ---- Telas ----

export function tablesService(overrides: { db?: Database } = {}) {
  const { db } = overrides;
  const deps: TablesDependencies = {
    get db() {
      return db ?? getDatabase().db;
    },
    repo,
    findStore: getStore,
  };
  return {
    listTables: (ctx: RequestContext, filter?: { includeInactive?: boolean }) =>
      useCases.listTables(deps, ctx, filter),
    getTable: (ctx: RequestContext, tableId: Id) => useCases.getTable(deps, ctx, tableId),
    createTable: (ctx: RequestContext, input: Parameters<typeof useCases.createTable>[2]) =>
      useCases.createTable(deps, ctx, input),
    updateTable: (ctx: RequestContext, input: Parameters<typeof useCases.updateTable>[2]) =>
      useCases.updateTable(deps, ctx, input),
    releaseTable: (ctx: RequestContext, input: Parameters<typeof useCases.releaseTable>[2]) =>
      useCases.releaseTable(deps, ctx, input),
  };
}

export type TablesService = ReturnType<typeof tablesService>;
