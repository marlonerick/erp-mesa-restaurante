import type { AuthorizationOutcome } from '@/modules/authorization';
import type { MenuProduct } from '@/modules/catalog';
import type { StockShortage } from '@/modules/inventory';
import type { StoreInfo, StoreSettings } from '@/modules/organizations';
import type { ItemToConsume } from '@/modules/recipes';
import type { TableRecord, TableStatus } from '@/modules/tables';
import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, Permission, RequestContext } from '@/shared/kernel';
import type {
  ChosenModifier,
  KitchenTicketStatus,
  OrderItemStatus,
  OrderStatus,
  OrderType,
} from '../domain/rules';

export interface OrderRecord {
  readonly id: Id;
  readonly storeId: Id;
  readonly number: number;
  readonly openedDate: string;
  readonly type: OrderType;
  readonly status: OrderStatus;
  readonly label: string;
  readonly guests: number | null;
  readonly openedBy: Id;
  readonly openedAt: Date;
  readonly version: number;
}

export interface ItemRecord {
  readonly id: Id;
  readonly orderId: Id;
  readonly roundId: Id | null;
  readonly productId: Id;
  readonly productName: string;
  readonly unitPriceCents: number;
  readonly modifiersCents: number;
  readonly quantity: number;
  readonly notes: string | null;
  readonly requiresPreparation: boolean;
  readonly status: OrderItemStatus;
  readonly kitchenTicketId: Id | null;
  readonly stockConsumed: boolean;
  readonly createdBy: Id;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
  readonly readyAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelReason: string | null;
  readonly modifiers: readonly ChosenModifier[];
}

export interface RoundRecord {
  readonly id: Id;
  readonly orderId: Id;
  readonly number: number;
  readonly sentBy: Id;
  readonly sentAt: Date;
}

/** Resumo de uma conta aberta para o mapa (RN-TAB-07). */
export interface OpenOrderSummary {
  readonly id: Id;
  readonly number: number;
  readonly type: OrderType;
  readonly label: string;
  readonly openedAt: Date;
  readonly version: number;
  readonly subtotalCents: number;
  readonly pendingCount: number;
  readonly readyCount: number;
}

export interface NewItem {
  readonly id: Id;
  readonly storeId: Id;
  readonly orderId: Id;
  readonly productId: Id;
  readonly productName: string;
  readonly unitPriceCents: number;
  readonly modifiersCents: number;
  readonly quantity: number;
  readonly notes: string | null;
  readonly requiresPreparation: boolean;
  readonly createdBy: Id;
  readonly createdAt: Date;
  readonly modifiers: readonly ChosenModifier[];
}

/** Ticket como a cozinha vê (RN-KDS-02): conta, rodada e quem enviou. */
export interface KitchenTicketRecord {
  readonly id: Id;
  readonly stationId: Id;
  readonly status: KitchenTicketStatus;
  readonly orderId: Id;
  readonly orderNumber: number;
  readonly orderType: OrderType;
  readonly orderLabel: string;
  readonly roundNumber: number;
  readonly sentBy: Id;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly readyAt: Date | null;
  readonly finishedAt: Date | null;
}

/** Item com o que a cozinha precisa (sem preços). */
export interface KitchenItemRecord {
  readonly id: Id;
  readonly orderId: Id;
  readonly kitchenTicketId: Id | null;
  readonly status: OrderItemStatus;
  readonly requiresPreparation: boolean;
  readonly productName: string;
  readonly quantity: number;
  readonly notes: string | null;
  readonly startedAt: Date | null;
  readonly startedBy: Id | null;
  readonly readyAt: Date | null;
  readonly readyBy: Id | null;
  readonly cancelledAt: Date | null;
  readonly cancelReason: string | null;
  readonly modifiers: readonly ChosenModifier[];
}

/** Leitura COM TRAVA: vê o último dado confirmado, não a "foto" da transação (RN-ORD-21). */
export interface LockOption {
  readonly forUpdate?: boolean;
}

/**
 * Toda busca por id exige a LOJA (ADR-0009): de outra loja = inexistente. As travas seguem a ordem
 * conta(s) → mesas → estoque (RN-ORD-22).
 */
export interface OrdersRepository {
  /** Próximo número da conta na loja e no dia (linha travada — RN-ORD-04). */
  nextOrderNumber(tx: Transaction, storeId: Id, day: string): Promise<number>;
  insertOrder(tx: Transaction, input: Omit<OrderRecord, 'status' | 'version'>): Promise<void>;
  findOrder(
    tx: Transaction,
    scope: { storeId: Id; orderId: Id },
    options?: { forUpdate?: boolean },
  ): Promise<OrderRecord | null>;
  /** Trava as contas na ordem dos ids. */
  lockOrders(tx: Transaction, storeId: Id, orderIds: readonly Id[]): Promise<OrderRecord[]>;
  /** Incrementa a versão (a conta já está travada). */
  bumpOrder(tx: Transaction, orderId: Id, changes?: { label?: string }): Promise<void>;
  closeOrderAsCancelled(
    tx: Transaction,
    orderId: Id,
    data: { reason: string | null; mergedInto: Id | null; by: Id; at: Date },
  ): Promise<void>;
  listOpenOrders(tx: Transaction, storeId: Id): Promise<OpenOrderSummary[]>;

  listItems(tx: Transaction, orderId: Id, options?: LockOption): Promise<ItemRecord[]>;
  countItems(tx: Transaction, orderId: Id, options?: LockOption): Promise<number>;
  findItem(
    tx: Transaction,
    scope: { storeId: Id; itemId: Id },
    options?: LockOption,
  ): Promise<ItemRecord | null>;
  insertItem(tx: Transaction, item: NewItem): Promise<void>;
  deleteItems(tx: Transaction, itemIds: readonly Id[]): Promise<void>;
  markSent(
    tx: Transaction,
    itemIds: readonly Id[],
    data: {
      roundId: Id;
      status: 'ENVIADO' | 'PRONTO';
      stationId: Id | null;
      ticketId: Id | null;
      at: Date;
    },
  ): Promise<void>;
  markDelivered(tx: Transaction, itemId: Id, data: { by: Id; at: Date }): Promise<void>;
  markCancelled(
    tx: Transaction,
    itemId: Id,
    data: { by: Id; authorizedBy: Id | null; reason: string; at: Date },
  ): Promise<void>;
  moveItems(tx: Transaction, fromOrderId: Id, toOrderId: Id): Promise<void>;

  listRounds(tx: Transaction, orderId: Id, options?: LockOption): Promise<RoundRecord[]>;
  insertRound(tx: Transaction, round: RoundRecord & { storeId: Id }): Promise<void>;
  /** Leva as rodadas para a outra conta, com os números novos. */
  moveRounds(
    tx: Transaction,
    toOrderId: Id,
    renumber: readonly { roundId: Id; number: number }[],
  ): Promise<void>;

  insertTicket(
    tx: Transaction,
    ticket: { id: Id; storeId: Id; orderId: Id; roundId: Id; stationId: Id; createdAt: Date },
  ): Promise<void>;
  /**
   * Recalcula a situação do ticket pelos itens (RN-ORD-14, RN-KDS-06) e as horas de início,
   * pronto e saída da fila. Chamado com a conta já travada.
   */
  refreshTicket(tx: Transaction, scope: { storeId: Id; ticketId: Id }, at: Date): Promise<void>;
  moveTickets(tx: Transaction, fromOrderId: Id, toOrderId: Id): Promise<void>;

  // ---- Cozinha (Etapa 7 — usados pelo módulo Kitchen) ----

  /** Fila da estação: NOVO e EM_PREPARO, do mais antigo para o mais novo (RN-KDS-02). */
  listQueue(tx: Transaction, scope: { storeId: Id; stationId: Id }): Promise<KitchenTicketRecord[]>;
  /** Tickets que saíram da fila com a situação dada desde `since`, o mais recente primeiro. */
  listFinished(
    tx: Transaction,
    scope: { storeId: Id; stationId: Id },
    filter: { status: 'PRONTO' | 'CANCELADO'; since: Date; limit: number },
  ): Promise<KitchenTicketRecord[]>;
  findTicket(
    tx: Transaction,
    scope: { storeId: Id; ticketId: Id },
    options?: LockOption,
  ): Promise<KitchenTicketRecord | null>;
  listTicketItems(
    tx: Transaction,
    storeId: Id,
    ticketIds: readonly Id[],
    options?: LockOption,
  ): Promise<KitchenItemRecord[]>;
  findKitchenItem(
    tx: Transaction,
    scope: { storeId: Id; itemId: Id },
    options?: LockOption,
  ): Promise<KitchenItemRecord | null>;
  /** ENVIADO → EM_PREPARO. */
  startItems(
    tx: Transaction,
    storeId: Id,
    itemIds: readonly Id[],
    data: { by: Id; at: Date },
  ): Promise<void>;
  /** ENVIADO/EM_PREPARO → PRONTO. */
  readyItems(
    tx: Transaction,
    storeId: Id,
    itemIds: readonly Id[],
    data: { by: Id; at: Date },
  ): Promise<void>;
  /** PRONTO → EM_PREPARO (desfazer — RN-KDS-07); `startedAt` = quando começou (ou agora). */
  undoReady(tx: Transaction, storeId: Id, itemId: Id, data: { startedAt: Date }): Promise<void>;
}

/** O que a comanda usa dos outros módulos (injetado — ADR-0014). */
export interface OrdersDependencies {
  readonly db: Database;
  readonly repo: OrdersRepository;
  readonly stores: {
    findStore(tx: Transaction, storeId: Id): Promise<StoreInfo | null>;
    settings(
      tx: Transaction,
      scope: { organizationId: Id; storeId: Id },
    ): Promise<StoreSettings | null>;
    defaultStation(tx: Transaction, storeId: Id): Promise<{ id: Id; name: string } | null>;
  };
  readonly tables: {
    listActive(tx: Transaction, storeId: Id): Promise<TableRecord[]>;
    lock(tx: Transaction, storeId: Id, tableIds: readonly Id[]): Promise<TableRecord[]>;
    lockOfOrder(tx: Transaction, storeId: Id, orderId: Id): Promise<TableRecord[]>;
    setState(
      tx: Transaction,
      tableIds: readonly Id[],
      state: { status: TableStatus; currentOrderId: Id | null },
    ): Promise<void>;
  };
  readonly menu: (tx: Transaction, scope: { companyId: Id; storeId: Id }) => Promise<MenuProduct[]>;
  readonly stock: {
    consumeForItems(
      tx: Transaction,
      ctx: RequestContext,
      items: readonly ItemToConsume[],
    ): Promise<StockShortage[]>;
    reverse(tx: Transaction, ctx: RequestContext, originId: Id): Promise<void>;
    toLoss(tx: Transaction, ctx: RequestContext, originId: Id): Promise<void>;
  };
  readonly authorizeOrElevate: (
    tx: Transaction,
    ctx: RequestContext,
    permission: Permission,
    grantToken: string | null,
  ) => Promise<AuthorizationOutcome>;
  readonly userNames: (tx: Transaction, ids: readonly Id[]) => Promise<Map<Id, string>>;
}
