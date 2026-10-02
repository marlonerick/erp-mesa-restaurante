import { recordAuditFromContext } from '@/modules/audit';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, RequestContext } from '@/shared/kernel';
import { changeTables, orderErrors } from './orders';
import type { ItemRecord, OrderRecord, OrdersDependencies } from './ports';

// O que o PDV (módulo POS) usa do Orders, SEMPRE na transação de quem chama (Etapa 8 —
// docs/modules/pos.md). A conta, os itens e as mesas são do Orders; Orders não conhece POS.

export function billingPort(deps: OrdersDependencies) {
  const { repo } = deps;
  type Args<K extends keyof typeof repo> = Parameters<(typeof repo)[K]>;

  return {
    /**
     * Trava a conta da loja. Chame como PRIMEIRA leitura da transação (ADR-0008): a "foto" do
     * REPEATABLE READ nasce depois da trava, e as leituras comuns seguintes (itens, pagamentos) já
     * veem o que o outro caixa ou garçom confirmou.
     */
    async lockOrder(tx: Transaction, storeId: Id, orderId: Id): Promise<OrderRecord> {
      const order = await repo.findOrder(tx, { storeId, orderId }, { forUpdate: true });
      if (!order) throw orderErrors.orderNotFound();
      return order;
    },

    /** Itens da conta (leitura comum — a conta já está travada). */
    listItems: (tx: Transaction, orderId: Id): Promise<ItemRecord[]> => repo.listItems(tx, orderId),
    listOpenOrders: (...args: Args<'listOpenOrders'>) => repo.listOpenOrders(...args),
    findOrder: (tx: Transaction, storeId: Id, orderId: Id) =>
      repo.findOrder(tx, { storeId, orderId }),
    setItemDiscount: (...args: Args<'setItemDiscount'>) => repo.setItemDiscount(...args),
    updateBill: (...args: Args<'updateBill'>) => repo.updateBill(...args),

    /** Pré-conta ou 1º pagamento: as mesas da conta vão para EM_PAGAMENTO (RN-POS-04, 11). */
    async markPaying(tx: Transaction, ctx: RequestContext, order: OrderRecord) {
      if (order.type !== 'MESA') return;
      const tables = await deps.tables.lockOfOrder(tx, ctx.storeId, order.id);
      await changeTables(
        deps,
        tx,
        ctx,
        tables.filter((table) => table.status === 'OCUPADA' || table.status === 'AGUARDANDO_CONTA'),
        'EM_PAGAMENTO',
        order.id,
      );
    },

    /** Conta paga (RN-POS-12): FECHADO com os valores congelados; mesas para LIMPEZA. */
    async closeAsPaid(
      tx: Transaction,
      ctx: RequestContext,
      order: OrderRecord,
      totals: {
        itemsCents: number;
        discountsCents: number;
        serviceFeeCents: number;
        totalCents: number;
      },
    ) {
      await repo.closeOrderAsPaid(
        tx,
        { storeId: ctx.storeId, orderId: order.id },
        { by: ctx.userId, at: ctx.clock.now(), ...totals },
      );
      if (order.type === 'MESA') {
        const tables = await deps.tables.lockOfOrder(tx, ctx.storeId, order.id);
        // A conta saiu da mesa: o garçom libera depois da limpeza (RN-TAB-05)
        await changeTables(deps, tx, ctx, tables, 'LIMPEZA', null);
      }
      await recordAuditFromContext(tx, ctx, 'ORDER_CLOSED', {
        entityType: 'customer_order',
        entityId: order.id,
        after: { order: order.number, label: order.label, ...totals },
      });
    },
  };
}

export type BillingPort = ReturnType<typeof billingPort>;
