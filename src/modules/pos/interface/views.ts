import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/modules/cashier';
import { ITEM_STATUS_LABEL, type OrderItemStatus } from '@/modules/orders';
import type { BillDetail, Receivable } from '../application/pos';
import type { BillTotals } from '../domain/rules';

// Dados prontos para a tela do PDV: datas em texto ISO, textos traduzidos. A tela nunca importa o
// domínio (ADR-0014).

export interface BillItemView {
  readonly id: string;
  readonly productName: string;
  readonly quantity: number;
  readonly modifiers: string[];
  readonly status: OrderItemStatus;
  readonly statusLabel: string;
  readonly lineCents: number;
  readonly discountCents: number;
  readonly discountReason: string | null;
  /** Já pago na divisão por itens. */
  readonly paid: boolean;
}

export interface PaymentView {
  readonly id: string;
  readonly method: PaymentMethod;
  readonly methodLabel: string;
  readonly amountCents: number;
  readonly changeCents: number | null;
  readonly reference: string | null;
  readonly cancelled: boolean;
  readonly cancelReason: string | null;
  readonly createdAt: string;
  readonly createdByName: string | null;
}

export interface BillView {
  readonly orderId: string;
  readonly number: number;
  readonly type: 'MESA' | 'BALCAO';
  /** "Mesa 10" ou "Balcão · Ana". */
  readonly title: string;
  readonly status: 'ABERTO' | 'FECHADO' | 'CANCELADO';
  readonly openedAt: string;
  readonly prebillAt: string | null;
  readonly serviceFeeWaived: boolean;
  /** Percentual congelado na abertura (RN-POS-03), mesmo que retirado. */
  readonly serviceFeeBp: number;
  readonly discountReason: string | null;
  readonly pendingCount: number;
  readonly items: BillItemView[];
  readonly payments: PaymentView[];
  readonly totals: BillTotals;
}

export interface ReceivableView {
  readonly orderId: string;
  readonly number: number;
  readonly title: string;
  readonly openedAt: string;
  readonly pendingCount: number;
  readonly prebill: boolean;
  readonly totals: BillTotals;
}

const titleOf = (type: 'MESA' | 'BALCAO', label: string) =>
  type === 'MESA' ? `Mesa ${label}` : `Balcão · ${label}`;

export function toBillView(detail: BillDetail): BillView {
  const { order } = detail;
  return {
    orderId: order.id,
    number: order.number,
    type: order.type,
    title: titleOf(order.type, order.label),
    status: order.status,
    openedAt: order.openedAt.toISOString(),
    prebillAt: order.prebillAt?.toISOString() ?? null,
    serviceFeeWaived: order.serviceFeeWaived,
    serviceFeeBp: order.serviceFeeBp,
    discountReason: order.discountReason,
    pendingCount: detail.items.filter((item) => item.status === 'PENDENTE').length,
    items: detail.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      modifiers: item.modifiers.map((extra) => extra.name),
      status: item.status,
      statusLabel: ITEM_STATUS_LABEL[item.status],
      lineCents: item.lineCents,
      discountCents: item.discountCents,
      discountReason: item.discountReason,
      paid: item.paid,
    })),
    payments: detail.payments.map((item) => ({
      id: item.id,
      method: item.method,
      methodLabel: PAYMENT_METHOD_LABEL[item.method],
      amountCents: item.amountCents,
      changeCents: item.changeCents,
      reference: item.reference,
      cancelled: item.status === 'CANCELADO',
      cancelReason: item.cancelReason,
      createdAt: item.createdAt.toISOString(),
      createdByName: item.createdByName,
    })),
    totals: detail.totals,
  };
}

export function toReceivableView(rows: readonly Receivable[]): ReceivableView[] {
  return rows.map((row) => ({
    orderId: row.orderId,
    number: row.number,
    title: titleOf(row.type, row.label),
    openedAt: row.openedAt.toISOString(),
    pendingCount: row.pendingCount,
    prebill: row.prebillAt !== null || row.totals.paidCents > 0,
    totals: row.totals,
  }));
}
