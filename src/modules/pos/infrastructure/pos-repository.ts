import { and, asc, eq, sql } from 'drizzle-orm';
import { payment, paymentAllocation } from '@/shared/db/schema';
import type { Id } from '@/shared/kernel';
import type { PosRepository } from '../application/ports';

const paymentColumns = {
  id: payment.id,
  orderId: payment.orderId,
  cashSessionId: payment.cashSessionId,
  method: payment.method,
  amountCents: payment.amountCents,
  tenderedCents: payment.tenderedCents,
  changeCents: payment.changeCents,
  reference: payment.reference,
  status: payment.status,
  createdBy: payment.createdBy,
  createdAt: payment.createdAt,
  cancelReason: payment.cancelReason,
  version: payment.version,
};

export const posRepository: PosRepository = {
  async insertPayment(tx, input) {
    await tx.insert(payment).values({ ...input, status: 'ATIVO' });
  },

  listPayments(tx, { storeId, orderId }) {
    // UUIDv7: ordem de lançamento
    return tx
      .select(paymentColumns)
      .from(payment)
      .where(and(eq(payment.orderId, orderId), eq(payment.storeId, storeId)))
      .orderBy(asc(payment.id));
  },

  async findPayment(tx, { storeId, paymentId }, options = {}) {
    const query = tx
      .select(paymentColumns)
      .from(payment)
      .where(and(eq(payment.id, paymentId), eq(payment.storeId, storeId)));
    const [row] = options.forUpdate ? await query.for('update') : await query;
    return row ?? null;
  },

  async cancelPayment(tx, { storeId, paymentId }, data) {
    await tx
      .update(payment)
      .set({
        status: 'CANCELADO',
        cancelledBy: data.by,
        cancelledAt: data.at,
        cancelReason: data.reason,
        cancelAuthorizedBy: data.authorizedBy,
        version: sql`${payment.version} + 1`,
      })
      .where(and(eq(payment.id, paymentId), eq(payment.storeId, storeId)));
  },

  async insertAllocations(tx, paymentId, lines) {
    if (lines.length === 0) return;
    await tx.insert(paymentAllocation).values(
      lines.map((line) => ({
        paymentId,
        orderItemId: line.itemId as Id,
        amountCents: line.amountCents,
      })),
    );
  },

  async listAllocatedItemIds(tx, { storeId, orderId }) {
    const rows = await tx
      .select({ itemId: paymentAllocation.orderItemId })
      .from(paymentAllocation)
      .innerJoin(payment, eq(payment.id, paymentAllocation.paymentId))
      .where(
        and(
          eq(payment.orderId, orderId),
          eq(payment.storeId, storeId),
          eq(payment.status, 'ATIVO'),
        ),
      );
    return new Set(rows.map((row) => row.itemId));
  },
};
