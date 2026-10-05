import { and, asc, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { financeCategory, financeEntry } from '@/shared/db/schema';
import { newId } from '@/shared/kernel';
import type { FinanceRepository } from '../application/ports';
import { UPCOMING_LIMIT } from '../domain/rules';

const categoryColumns = {
  id: financeCategory.id,
  companyId: financeCategory.companyId,
  type: financeCategory.type,
  name: financeCategory.name,
  systemCode: financeCategory.systemCode,
  active: financeCategory.active,
  version: financeCategory.version,
};

const entryColumns = {
  id: financeEntry.id,
  storeId: financeEntry.storeId,
  type: financeEntry.type,
  categoryId: financeEntry.categoryId,
  categoryName: financeCategory.name,
  description: financeEntry.description,
  amountCents: financeEntry.amountCents,
  competenceDate: financeEntry.competenceDate,
  dueDate: financeEntry.dueDate,
  paidDate: financeEntry.paidDate,
  status: financeEntry.status,
  source: financeEntry.source,
  paymentMethod: financeEntry.paymentMethod,
  createdBy: financeEntry.createdBy,
  createdAt: financeEntry.createdAt,
  cancelReason: financeEntry.cancelReason,
  version: financeEntry.version,
};

type Tx = Parameters<FinanceRepository['listCategories']>[0];
const selectEntries = (tx: Tx) =>
  tx
    .select(entryColumns)
    .from(financeEntry)
    .innerJoin(financeCategory, eq(financeCategory.id, financeEntry.categoryId));

export const financeRepository: FinanceRepository = {
  async ensureCategories(tx, companyId, categories) {
    // Duas primeiras visitas ao mesmo tempo: o índice único decide; a outra não muda nada
    for (const category of categories) {
      await tx
        .insert(financeCategory)
        .values({
          id: newId(),
          companyId,
          type: category.type,
          name: category.name,
          systemCode: category.systemCode ?? null,
        })
        .onDuplicateKeyUpdate({ set: { id: sql`${financeCategory.id}` } });
    }
  },

  listCategories(tx, companyId) {
    return tx
      .select(categoryColumns)
      .from(financeCategory)
      .where(eq(financeCategory.companyId, companyId))
      .orderBy(asc(financeCategory.type), asc(financeCategory.name));
  },

  async findCategory(tx, { companyId, categoryId }) {
    const [row] = await tx
      .select(categoryColumns)
      .from(financeCategory)
      .where(and(eq(financeCategory.id, categoryId), eq(financeCategory.companyId, companyId)));
    return row ?? null;
  },

  async findSystemCategory(tx, companyId, code) {
    const [row] = await tx
      .select(categoryColumns)
      .from(financeCategory)
      .where(and(eq(financeCategory.companyId, companyId), eq(financeCategory.systemCode, code)));
    return row ?? null;
  },

  async insertCategory(tx, category) {
    await tx.insert(financeCategory).values(category);
  },

  async setCategoryActive(tx, { companyId, categoryId, version }, active) {
    const [result] = await tx
      .update(financeCategory)
      .set({ active, version: sql`${financeCategory.version} + 1` })
      .where(
        and(
          eq(financeCategory.id, categoryId),
          eq(financeCategory.companyId, companyId),
          eq(financeCategory.version, version),
        ),
      );
    return result.affectedRows === 1;
  },

  async insertEntry(tx, entry) {
    await tx.insert(financeEntry).values(entry);
  },

  async findEntry(tx, { storeId, entryId }, options = {}) {
    const query = selectEntries(tx).where(
      and(eq(financeEntry.id, entryId), eq(financeEntry.storeId, storeId)),
    );
    const [row] = options.forUpdate ? await query.for('update') : await query;
    return row ?? null;
  },

  async listEntries(tx, filter, page) {
    const conditions: SQL[] = [
      eq(financeEntry.storeId, filter.storeId),
      gte(financeEntry.competenceDate, filter.from),
      lte(financeEntry.competenceDate, filter.to),
    ];
    if (filter.type) conditions.push(eq(financeEntry.type, filter.type));
    if (filter.status) conditions.push(eq(financeEntry.status, filter.status));
    if (filter.categoryId) conditions.push(eq(financeEntry.categoryId, filter.categoryId));
    const where = and(...conditions);
    const rows = await selectEntries(tx)
      .where(where)
      .orderBy(desc(financeEntry.competenceDate), desc(financeEntry.id))
      .limit(page.limit)
      .offset(page.offset);
    // COUNT é BIGINT: chega como texto
    const [count] = await tx
      .select({ total: sql<string>`count(*)` })
      .from(financeEntry)
      .where(where);
    return { rows, total: Number(count?.total ?? 0) };
  },

  async markPaid(tx, { storeId, entryId }, paidDate) {
    await tx
      .update(financeEntry)
      .set({ status: 'PAGO', paidDate, version: sql`${financeEntry.version} + 1` })
      .where(and(eq(financeEntry.id, entryId), eq(financeEntry.storeId, storeId)));
  },

  async markCancelled(tx, { storeId, entryId }, data) {
    await tx
      .update(financeEntry)
      .set({
        status: 'CANCELADO',
        cancelledBy: data.by,
        cancelledAt: data.at,
        cancelReason: data.reason,
        version: sql`${financeEntry.version} + 1`,
      })
      .where(and(eq(financeEntry.id, entryId), eq(financeEntry.storeId, storeId)));
  },

  async paidTotals(tx, { storeId, from, to }) {
    const rows = await tx
      .select({
        date: financeEntry.paidDate,
        type: financeEntry.type,
        // SUM chega como texto (DECIMAL)
        amount: sql<string>`sum(${financeEntry.amountCents})`,
      })
      .from(financeEntry)
      .where(
        and(
          eq(financeEntry.storeId, storeId),
          eq(financeEntry.status, 'PAGO'),
          gte(financeEntry.paidDate, from),
          lte(financeEntry.paidDate, to),
        ),
      )
      .groupBy(financeEntry.paidDate, financeEntry.type);
    return rows.map((row) => ({
      date: row.date ?? from,
      type: row.type,
      amountCents: Number(row.amount),
    }));
  },

  upcoming(tx, { storeId, until }) {
    return selectEntries(tx)
      .where(
        and(
          eq(financeEntry.storeId, storeId),
          eq(financeEntry.status, 'PREVISTO'),
          lte(financeEntry.dueDate, until),
        ),
      )
      .orderBy(asc(financeEntry.dueDate), asc(financeEntry.id))
      .limit(UPCOMING_LIMIT);
  },
};
