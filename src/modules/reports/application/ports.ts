import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id } from '@/shared/kernel';

// O que os relatórios leem do banco (implementado em infrastructure/ — somente leitura).

export interface DayTotals {
  readonly date: string;
  readonly orders: number;
  readonly itemsCents: number;
  readonly discountsCents: number;
  readonly serviceFeeCents: number;
  readonly totalCents: number;
}

export interface CategoryTotals {
  readonly name: string;
  readonly quantity: number;
  readonly grossCents: number;
  readonly discountsCents: number;
}

export interface MethodTotals {
  readonly method: string;
  readonly payments: number;
  readonly amountCents: number;
}

export interface ProductTotals {
  readonly productId: Id;
  readonly name: string;
  readonly quantity: number;
  readonly grossCents: number;
  readonly discountsCents: number;
  readonly costCents: number;
}

export interface CashSessionRow {
  readonly id: Id;
  readonly status: 'ABERTA' | 'FECHADA';
  readonly operationalDate: string;
  readonly terminalCode: string;
  readonly terminalName: string;
  readonly openedBy: Id;
  readonly openedAt: Date;
  readonly closedBy: Id | null;
  readonly closedAt: Date | null;
  readonly openingCents: number;
}

export interface CashMovementRow {
  readonly id: Id;
  readonly sessionId: Id;
  readonly type: 'VENDA' | 'SANGRIA' | 'SUPRIMENTO' | 'AJUSTE' | 'ESTORNO';
  readonly paymentMethod: 'DINHEIRO' | 'PIX' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'OUTRO';
  readonly amountCents: number;
  readonly reason: string | null;
  readonly userId: Id;
  readonly occurredAt: Date;
}

export interface CashCountRow {
  readonly sessionId: Id;
  readonly method: string;
  readonly expectedCents: number;
  readonly declaredCents: number | null;
  readonly differenceCents: number | null;
}

export interface StockBalanceRow {
  readonly ingredientId: Id;
  readonly name: string;
  readonly unit: string;
  readonly quantity: string;
  readonly minQuantity: string;
  readonly avgUnitCost: string;
}

export interface OpenedOrdersRow {
  readonly type: 'MESA' | 'BALCAO';
  readonly status: 'ABERTO' | 'FECHADO' | 'CANCELADO';
  readonly orders: number;
  readonly merged: number;
  readonly guests: number;
  readonly withGuests: number;
  readonly serviceFeeWaived: number;
}

export interface AuditRow {
  readonly id: Id;
  readonly event: string;
  readonly occurredAt: Date;
  readonly actorUserId: Id | null;
  readonly actorName: string | null;
  readonly authorizerUserId: Id | null;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly beforeData: Record<string, unknown> | null;
  readonly afterData: Record<string, unknown> | null;
}

type Page = { offset: number; limit: number } | null;

/** Toda consulta filtra a loja (ADR-0009). */
export interface ReportsRepository {
  closedOrdersByDay(tx: Transaction, storeId: Id, from: string, to: string): Promise<DayTotals[]>;
  salesByCategory(
    tx: Transaction,
    storeId: Id,
    from: string,
    to: string,
  ): Promise<CategoryTotals[]>;
  paymentsByMethod(tx: Transaction, storeId: Id, from: string, to: string): Promise<MethodTotals[]>;
  salesByProduct(
    tx: Transaction,
    storeId: Id,
    from: string,
    to: string,
    page: Page,
  ): Promise<{ total: number; rows: ProductTotals[] }>;
  topProducts(
    tx: Transaction,
    storeId: Id,
    day: string,
    limit: number,
  ): Promise<{ name: string; quantity: number }[]>;
  cashSessions(tx: Transaction, storeId: Id, from: string, to: string): Promise<CashSessionRow[]>;
  cashMovementTotals(
    tx: Transaction,
    storeId: Id,
    sessionIds: readonly Id[],
  ): Promise<{ sessionId: Id; type: CashMovementRow['type']; amountCents: number }[]>;
  cashMovements(
    tx: Transaction,
    storeId: Id,
    sessionIds: readonly Id[],
  ): Promise<CashMovementRow[]>;
  cashCounts(tx: Transaction, storeId: Id, sessionIds: readonly Id[]): Promise<CashCountRow[]>;
  stockBalances(tx: Transaction, storeId: Id): Promise<StockBalanceRow[]>;
  stockMovementsByType(
    tx: Transaction,
    storeId: Id,
    from: string,
    to: string,
  ): Promise<{ type: string; movements: number; valueCents: number }[]>;
  ordersOpened(tx: Transaction, storeId: Id, from: string, to: string): Promise<OpenedOrdersRow[]>;
  cancelledItems(
    tx: Transaction,
    storeId: Id,
    from: string,
    to: string,
  ): Promise<{ reason: string; items: number; valueCents: number }[]>;
  openOrders(tx: Transaction, storeId: Id): Promise<number>;
  occupiedTables(tx: Transaction, storeId: Id): Promise<number>;
  kitchenItems(
    tx: Transaction,
    storeId: Id,
    lateBefore: Date,
  ): Promise<{ items: number; late: number }>;
  openCashSessions(
    tx: Transaction,
    storeId: Id,
  ): Promise<
    { id: Id; terminalCode: string; terminalName: string; openedBy: Id; openedAt: Date }[]
  >;
  lowStock(
    tx: Transaction,
    storeId: Id,
  ): Promise<{ name: string; unit: string; quantity: string; minQuantity: string }[]>;
  audit(
    tx: Transaction,
    filter: { storeId: Id; start: Date; end: Date; event: string | null; userId: Id | null },
    page: Page,
  ): Promise<{ rows: AuditRow[]; total: number }>;
}

export interface ReportsDependencies {
  readonly db: Database;
  readonly repo: ReportsRepository;
}
