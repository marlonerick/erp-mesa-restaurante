import { recordAuditFromContext } from '@/modules/audit';
import { MYSQL_ERRNO, mysqlErrno } from '@/shared/db/mysql-errors';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import {
  DomainError,
  type Id,
  newId,
  type RequestContext,
  requirePermission,
} from '@/shared/kernel';
import { compareTables, tableArea, tableNumber, tableSeats } from '../domain/rules';
import type { TableRecord, TablesDependencies } from './ports';

// ---- Erros (docs/modules/tables.md §6) ----

export const tableErrors = {
  storeNotFound: () => new DomainError('STORE_NOT_FOUND', 'Loja não encontrada.', 'NOT_FOUND'),
  notFound: () => new DomainError('TABLE_NOT_FOUND', 'Mesa não encontrada.', 'NOT_FOUND'),
  numberTaken: () =>
    new DomainError(
      'TABLE_NUMBER_TAKEN',
      'Já existe uma mesa com este número nesta loja.',
      'CONFLICT',
    ),
  inUse: () =>
    new DomainError('TABLE_IN_USE', 'Só dá para desativar uma mesa livre.', 'BUSINESS_RULE'),
  numberInUse: () =>
    new DomainError(
      'TABLE_IN_USE',
      'Só dá para trocar o número de uma mesa livre.',
      'BUSINESS_RULE',
    ),
  notInCleaning: () =>
    new DomainError('TABLE_NOT_IN_CLEANING', 'Esta mesa não está em limpeza.', 'BUSINESS_RULE'),
  concurrent: () =>
    new DomainError(
      'CONCURRENT_MODIFICATION',
      'Outra pessoa alterou estes dados. Recarregue a página e tente de novo.',
      'CONFLICT',
    ),
};

async function mapDuplicate<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (caught) {
    if (mysqlErrno(caught) === MYSQL_ERRNO.DUPLICATE_ENTRY) throw tableErrors.numberTaken();
    throw caught;
  }
}

/** A loja da sessão existe e é desta organização (RN-TAB-01). */
async function checkStore(deps: TablesDependencies, tx: Transaction, ctx: RequestContext) {
  const found = await deps.findStore(tx, ctx.storeId);
  if (found?.organizationId !== ctx.organizationId) throw tableErrors.storeNotFound();
}

// ---- Cadastro (RN-TAB-02, RN-TAB-03) ----

export async function listTables(
  deps: TablesDependencies,
  ctx: RequestContext,
  filter: { includeInactive?: boolean } = {},
): Promise<TableRecord[]> {
  requirePermission(ctx, 'tables.read');
  return runInTransaction(deps.db, async (tx) => {
    await checkStore(deps, tx, ctx);
    const rows = await deps.repo.listTables(tx, {
      storeId: ctx.storeId,
      includeInactive: filter.includeInactive ?? false,
    });
    return rows.sort(compareTables);
  });
}

export async function getTable(
  deps: TablesDependencies,
  ctx: RequestContext,
  tableId: Id,
): Promise<TableRecord> {
  requirePermission(ctx, 'tables.configure');
  return runInTransaction(deps.db, async (tx) => {
    await checkStore(deps, tx, ctx);
    const found = await deps.repo.findTable(tx, { storeId: ctx.storeId, tableId });
    if (!found) throw tableErrors.notFound();
    return found;
  });
}

export async function createTable(
  deps: TablesDependencies,
  ctx: RequestContext,
  input: { number: string; area?: string | null; seats: number },
): Promise<{ id: Id }> {
  requirePermission(ctx, 'tables.configure');
  const data = {
    number: tableNumber(input.number),
    area: tableArea(input.area),
    seats: tableSeats(input.seats),
    active: true,
  };
  const id = newId();
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      await checkStore(deps, tx, ctx);
      await deps.repo.insertTable(tx, { ...data, id, storeId: ctx.storeId });
      await recordAuditFromContext(tx, ctx, 'TABLE_CREATED', {
        entityType: 'dining_table',
        entityId: id,
        after: { number: data.number, area: data.area, seats: data.seats },
      });
    }),
  );
  return { id };
}

export async function updateTable(
  deps: TablesDependencies,
  ctx: RequestContext,
  input: {
    tableId: Id;
    version: number;
    number: string;
    area?: string | null;
    seats: number;
    active: boolean;
  },
): Promise<void> {
  requirePermission(ctx, 'tables.configure');
  const data = {
    number: tableNumber(input.number),
    area: tableArea(input.area),
    seats: tableSeats(input.seats),
    active: input.active,
  };
  await mapDuplicate(
    runInTransaction(deps.db, async (tx) => {
      await checkStore(deps, tx, ctx);
      const current = await deps.repo.findTable(
        tx,
        { storeId: ctx.storeId, tableId: input.tableId },
        { forUpdate: true },
      );
      if (!current) throw tableErrors.notFound();
      if (current.version !== input.version) throw tableErrors.concurrent();
      // Mesa em uso não sai do mapa (RN-TAB-03)
      if (current.active && !data.active && current.status !== 'LIVRE') throw tableErrors.inUse();
      // A conta aberta guarda o número da mesa no rótulo: trocar o número agora o deixaria velho
      if (current.number !== data.number && current.status !== 'LIVRE') {
        throw tableErrors.numberInUse();
      }
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const key of ['number', 'area', 'seats', 'active'] as const) {
        if (current[key] !== data[key]) {
          before[key] = current[key];
          after[key] = data[key];
        }
      }
      if (Object.keys(after).length === 0) return;
      if (!(await deps.repo.updateTable(tx, current.id, input.version, data))) {
        throw tableErrors.concurrent();
      }
      await recordAuditFromContext(tx, ctx, 'TABLE_UPDATED', {
        entityType: 'dining_table',
        entityId: current.id,
        before,
        after,
      });
    }),
  );
}

// ---- Estado (RN-TAB-05) ----

/** Mesa limpa volta a ficar livre. */
export async function releaseTable(
  deps: TablesDependencies,
  ctx: RequestContext,
  input: { tableId: Id },
): Promise<void> {
  requirePermission(ctx, 'tables.manage');
  await runInTransaction(deps.db, async (tx) => {
    await checkStore(deps, tx, ctx);
    const [table] = await deps.repo.lockTables(tx, ctx.storeId, [input.tableId]);
    if (!table) throw tableErrors.notFound();
    if (table.status !== 'LIMPEZA') throw tableErrors.notInCleaning();
    await deps.repo.setState(tx, [table.id], { status: 'LIVRE', currentOrderId: null });
    await recordAuditFromContext(tx, ctx, 'TABLE_STATUS_CHANGED', {
      entityType: 'dining_table',
      entityId: table.id,
      before: { number: table.number, status: 'LIMPEZA' },
      after: { status: 'LIVRE' },
    });
  });
}
