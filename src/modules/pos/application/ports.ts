import type { AuthorizationOutcome } from '@/modules/authorization';
import type { CashierPort, PaymentMethod } from '@/modules/cashier';
import type { BillingPort } from '@/modules/orders';
import type { StoreInfo } from '@/modules/organizations';
import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, Permission, RequestContext } from '@/shared/kernel';

export type PaymentStatus = 'ATIVO' | 'CANCELADO';

export interface PaymentRecord {
  readonly id: Id;
  readonly orderId: Id;
  readonly cashSessionId: Id;
  readonly method: PaymentMethod;
  readonly amountCents: number;
  readonly tenderedCents: number | null;
  readonly changeCents: number | null;
  readonly reference: string | null;
  readonly status: PaymentStatus;
  readonly createdBy: Id;
  readonly createdAt: Date;
  readonly cancelReason: string | null;
  readonly version: number;
}

export interface PosRepository {
  insertPayment(
    tx: Transaction,
    payment: Omit<PaymentRecord, 'status' | 'cancelReason' | 'version'> & { storeId: Id },
  ): Promise<void>;
  listPayments(tx: Transaction, orderId: Id): Promise<PaymentRecord[]>;
  findPayment(
    tx: Transaction,
    scope: { storeId: Id; paymentId: Id },
    options?: { forUpdate?: boolean },
  ): Promise<PaymentRecord | null>;
  cancelPayment(
    tx: Transaction,
    paymentId: Id,
    data: { by: Id; at: Date; reason: string; authorizedBy: Id | null },
  ): Promise<void>;
  insertAllocations(
    tx: Transaction,
    paymentId: Id,
    lines: readonly { itemId: string; amountCents: number }[],
  ): Promise<void>;
  /** Itens já pagos na divisão por itens (pagamentos ATIVOS). */
  listAllocatedItemIds(tx: Transaction, orderId: Id): Promise<Set<Id>>;
}

/** O que o PDV usa dos outros módulos (injetado — ADR-0014). */
export interface PosDependencies {
  readonly db: Database;
  readonly repo: PosRepository;
  /** Conta, itens e mesas (API do Orders na transação). */
  readonly orders: BillingPort;
  /** Caixa aberto, venda e estorno (API do Cashier na transação). */
  readonly cashier: CashierPort;
  readonly findStore: (tx: Transaction, storeId: Id) => Promise<StoreInfo | null>;
  readonly discountLimit: (tx: Transaction, userId: Id, storeId: Id) => Promise<number>;
  readonly authorizeOrElevate: (
    tx: Transaction,
    ctx: RequestContext,
    permission: Permission,
    grantToken: string | null,
  ) => Promise<AuthorizationOutcome>;
  readonly userNames: (tx: Transaction, ids: readonly Id[]) => Promise<Map<Id, string>>;
}
