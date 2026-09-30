import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { diningTable } from '@/shared/db/schema';
import type { TablesRepository } from '../application/ports';

const columns = {
  id: diningTable.id,
  storeId: diningTable.storeId,
  number: diningTable.number,
  area: diningTable.area,
  seats: diningTable.seats,
  status: diningTable.status,
  currentOrderId: diningTable.currentOrderId,
  active: diningTable.active,
  version: diningTable.version,
};

export const tablesRepository: TablesRepository = {
  listTables(tx, { storeId, includeInactive }) {
    return tx
      .select(columns)
      .from(diningTable)
      .where(
        and(
          eq(diningTable.storeId, storeId),
          includeInactive ? undefined : eq(diningTable.active, true),
        ),
      );
  },

  async findTable(tx, { storeId, tableId }, options = {}) {
    const query = tx
      .select(columns)
      .from(diningTable)
      .where(and(eq(diningTable.id, tableId), eq(diningTable.storeId, storeId)));
    const [row] = options.forUpdate ? await query.for('update') : await query;
    return row ?? null;
  },

  async lockTables(tx, storeId, tableIds) {
    const ids = [...new Set(tableIds)];
    if (ids.length === 0) return [];
    return tx
      .select(columns)
      .from(diningTable)
      .where(and(eq(diningTable.storeId, storeId), inArray(diningTable.id, ids)))
      .orderBy(asc(diningTable.id))
      .for('update');
  },

  lockTablesOfOrder(tx, storeId, orderId) {
    return tx
      .select(columns)
      .from(diningTable)
      .where(and(eq(diningTable.storeId, storeId), eq(diningTable.currentOrderId, orderId)))
      .orderBy(asc(diningTable.id))
      .for('update');
  },

  async insertTable(tx, input) {
    await tx.insert(diningTable).values(input);
  },

  async updateTable(tx, id, version, data) {
    const [result] = await tx
      .update(diningTable)
      .set({ ...data, version: sql`${diningTable.version} + 1` })
      .where(and(eq(diningTable.id, id), eq(diningTable.version, version)));
    return result.affectedRows === 1;
  },

  async setState(tx, ids, state) {
    if (ids.length === 0) return;
    await tx
      .update(diningTable)
      .set({
        status: state.status,
        currentOrderId: state.currentOrderId,
        version: sql`${diningTable.version} + 1`,
      })
      .where(inArray(diningTable.id, [...ids]));
  },
};
