import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { cashMovement, cashSession, cashSessionCount } from '@/shared/db/schema';
import { newId } from '@/shared/kernel';
import type { CashierRepository } from '../application/ports';

const sessionColumns = {
  id: cashSession.id,
  storeId: cashSession.storeId,
  terminalId: cashSession.terminalId,
  status: cashSession.status,
  operationalDate: cashSession.operationalDate,
  openedBy: cashSession.openedBy,
  openedAt: cashSession.openedAt,
  openingAmountCents: cashSession.openingAmountCents,
  closedBy: cashSession.closedBy,
  closedAt: cashSession.closedAt,
  version: cashSession.version,
};

export const cashierRepository: CashierRepository = {
  async findSession(tx, { storeId, sessionId }, options = {}) {
    const query = tx
      .select(sessionColumns)
      .from(cashSession)
      .where(and(eq(cashSession.id, sessionId), eq(cashSession.storeId, storeId)));
    const [row] = options.forUpdate ? await query.for('update') : await query;
    return row ?? null;
  },

  async findOpenSessionOfTerminal(tx, { storeId, terminalId }, options = {}) {
    // Usa o índice único da coluna calculada `open_terminal_id`
    const query = tx
      .select(sessionColumns)
      .from(cashSession)
      .where(and(eq(cashSession.openTerminalId, terminalId), eq(cashSession.storeId, storeId)));
    const [row] = options.forUpdate ? await query.for('update') : await query;
    return row ?? null;
  },

  async countOpenSessions(tx, storeId) {
    const rows = await tx
      .select({ id: cashSession.id })
      .from(cashSession)
      .where(and(eq(cashSession.storeId, storeId), eq(cashSession.status, 'ABERTA')))
      .for('update');
    return rows.length;
  },

  async insertSession(tx, session) {
    await tx.insert(cashSession).values({ ...session, status: 'ABERTA' });
  },

  async closeSession(tx, { storeId, sessionId, version }, { by, at }) {
    const [result] = await tx
      .update(cashSession)
      .set({
        status: 'FECHADA',
        closedBy: by,
        closedAt: at,
        version: sql`${cashSession.version} + 1`,
      })
      .where(
        and(
          eq(cashSession.id, sessionId),
          eq(cashSession.storeId, storeId),
          eq(cashSession.version, version),
          eq(cashSession.status, 'ABERTA'),
        ),
      );
    return result.affectedRows === 1;
  },

  async insertMovement(tx, movement) {
    await tx.insert(cashMovement).values({ id: newId(), ...movement });
  },

  async movementTotals(tx, sessionId) {
    const rows = await tx
      .select({
        method: cashMovement.paymentMethod,
        // SUM de INT chega como texto (DECIMAL): converte explicitamente
        amount: sql<string>`sum(${cashMovement.amountCents})`,
      })
      .from(cashMovement)
      .where(eq(cashMovement.cashSessionId, sessionId))
      .groupBy(cashMovement.paymentMethod);
    return rows.map((row) => ({ method: row.method, amountCents: Number(row.amount) }));
  },

  listManualMovements(tx, sessionId) {
    return tx
      .select({
        id: cashMovement.id,
        type: cashMovement.type,
        paymentMethod: cashMovement.paymentMethod,
        amountCents: cashMovement.amountCents,
        reason: cashMovement.reason,
        userId: cashMovement.userId,
        occurredAt: cashMovement.occurredAt,
      })
      .from(cashMovement)
      .where(
        and(
          eq(cashMovement.cashSessionId, sessionId),
          inArray(cashMovement.type, ['SANGRIA', 'SUPRIMENTO', 'AJUSTE']),
        ),
      )
      .orderBy(asc(cashMovement.occurredAt), asc(cashMovement.id));
  },

  async insertCounts(tx, sessionId, lines) {
    if (lines.length === 0) return;
    await tx.insert(cashSessionCount).values(
      lines.map((line) => ({
        cashSessionId: sessionId,
        paymentMethod: line.method,
        expectedCents: line.expectedCents,
        declaredCents: line.declaredCents,
        differenceCents: line.differenceCents,
      })),
    );
  },

  async listCounts(tx, sessionId) {
    const rows = await tx
      .select({
        method: cashSessionCount.paymentMethod,
        expectedCents: cashSessionCount.expectedCents,
        declaredCents: cashSessionCount.declaredCents,
        differenceCents: cashSessionCount.differenceCents,
      })
      .from(cashSessionCount)
      .where(eq(cashSessionCount.cashSessionId, sessionId));
    return rows;
  },
};
