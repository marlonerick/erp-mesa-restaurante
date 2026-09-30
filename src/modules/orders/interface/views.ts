import type { MenuProduct } from '@/modules/catalog';
import { TABLE_STATUS_LABEL, type TableStatus } from '@/modules/tables';
import type { Floor, OrderDetail, OrderItemView } from '../application/orders';
import type { OpenOrderSummary } from '../application/ports';
import { cancelStockEffect, ITEM_STATUS_LABEL, type OrderItemStatus } from '../domain/rules';

// Dados prontos para a tela e para a leitura automática (JSON): datas em texto ISO, textos dos
// estados já traduzidos. A tela nunca importa o domínio (ADR-0014).

export interface OrderSummaryView {
  readonly id: string;
  readonly number: number;
  readonly type: 'MESA' | 'BALCAO';
  readonly label: string;
  readonly openedAt: string;
  readonly subtotalCents: number;
  readonly pendingCount: number;
  readonly readyCount: number;
}

export interface FloorTableView {
  readonly id: string;
  readonly number: string;
  readonly area: string | null;
  readonly seats: number;
  readonly status: TableStatus;
  readonly statusLabel: string;
  readonly order: OrderSummaryView | null;
}

export interface FloorView {
  readonly tables: FloorTableView[];
  readonly counter: OrderSummaryView[];
}

export interface ItemView {
  readonly id: string;
  readonly productName: string;
  readonly quantity: number;
  readonly notes: string | null;
  readonly status: OrderItemStatus;
  readonly statusLabel: string;
  readonly requiresPreparation: boolean;
  readonly modifiers: { readonly name: string; readonly priceDeltaCents: number }[];
  readonly totalCents: number;
  readonly cancelReason: string | null;
  /** O que acontece com o estoque se o item for cancelado agora (RN-ORD-13 — achado I-2). */
  readonly cancelEffect: 'ESTORNO' | 'PERDA' | null;
}

export interface RoundView {
  readonly id: string;
  readonly number: number;
  readonly sentAt: string;
  readonly sentByName: string | null;
  readonly items: ItemView[];
}

export interface OrderView {
  readonly id: string;
  readonly number: number;
  readonly type: 'MESA' | 'BALCAO';
  readonly status: 'ABERTO' | 'FECHADO' | 'CANCELADO';
  readonly label: string;
  readonly guests: number | null;
  readonly openedAt: string;
  readonly version: number;
  readonly tables: { readonly id: string; readonly number: string; readonly status: TableStatus }[];
  readonly pending: ItemView[];
  readonly rounds: RoundView[];
  readonly subtotalCents: number;
}

export interface MenuItemView {
  readonly productId: string;
  readonly name: string;
  readonly description: string | null;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly priceCents: number;
  readonly groups: {
    readonly id: string;
    readonly name: string;
    readonly minSelect: number;
    readonly maxSelect: number;
    readonly options: {
      readonly id: string;
      readonly name: string;
      readonly priceDeltaCents: number;
    }[];
  }[];
}

const summaryView = (order: OpenOrderSummary): OrderSummaryView => ({
  id: order.id,
  number: order.number,
  type: order.type,
  label: order.label,
  openedAt: order.openedAt.toISOString(),
  subtotalCents: order.subtotalCents,
  pendingCount: order.pendingCount,
  readyCount: order.readyCount,
});

export function toFloorView(floor: Floor): FloorView {
  return {
    tables: floor.tables.map((table) => ({
      id: table.id,
      number: table.number,
      area: table.area,
      seats: table.seats,
      status: table.status,
      statusLabel: TABLE_STATUS_LABEL[table.status],
      order: table.order ? summaryView(table.order) : null,
    })),
    counter: floor.counter.map(summaryView),
  };
}

const itemView = (item: OrderItemView): ItemView => ({
  id: item.id,
  productName: item.productName,
  quantity: item.quantity,
  notes: item.notes,
  status: item.status,
  statusLabel: ITEM_STATUS_LABEL[item.status],
  requiresPreparation: item.requiresPreparation,
  modifiers: item.modifiers.map((extra) => ({
    name: extra.name,
    priceDeltaCents: extra.priceDeltaCents,
  })),
  totalCents: item.totalCents,
  cancelReason: item.cancelReason,
  cancelEffect:
    item.status === 'PENDENTE' || item.status === 'CANCELADO' ? null : cancelStockEffect(item),
});

export function toOrderView(order: OrderDetail): OrderView {
  return {
    id: order.id,
    number: order.number,
    type: order.type,
    status: order.status,
    label: order.label,
    guests: order.guests,
    openedAt: order.openedAt.toISOString(),
    version: order.version,
    tables: order.tables,
    pending: order.pending.map(itemView),
    rounds: order.rounds.map((round) => ({
      id: round.id,
      number: round.number,
      sentAt: round.sentAt.toISOString(),
      sentByName: round.sentByName,
      items: round.items.map(itemView),
    })),
    subtotalCents: order.subtotalCents,
  };
}

export function toMenuView(menu: readonly MenuProduct[]): MenuItemView[] {
  return [...menu]
    .sort(
      (a, b) =>
        a.categorySortOrder - b.categorySortOrder ||
        a.categoryName.localeCompare(b.categoryName, 'pt-BR') ||
        a.name.localeCompare(b.name, 'pt-BR'),
    )
    .map((product) => ({
      productId: product.productId,
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      priceCents: product.priceCents,
      // Grupos obrigatórios primeiro ("Ponto da carne"): o garçom não passa por eles sem ver
      groups: [...product.modifierGroups]
        .sort((a, b) => Number(b.minSelect > 0) - Number(a.minSelect > 0))
        .filter((group) => group.options.length > 0 || group.minSelect > 0)
        .map((group) => ({
          id: group.id,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          options: group.options,
        })),
    }));
}
