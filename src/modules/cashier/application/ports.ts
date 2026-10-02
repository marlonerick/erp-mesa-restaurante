import type { StoreInfo, StoreSettings, TerminalKind } from '@/modules/organizations';
import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id } from '@/shared/kernel';
import type {
  CashMovementType,
  CashSessionStatus,
  CountLine,
  MovementTotal,
  PaymentMethod,
} from '../domain/rules';

export interface CashSessionRecord {
  readonly id: Id;
  readonly storeId: Id;
  readonly terminalId: Id;
  readonly status: CashSessionStatus;
  readonly operationalDate: string;
  readonly openedBy: Id;
  readonly openedAt: Date;
  readonly openingAmountCents: number;
  readonly closedBy: Id | null;
  readonly closedAt: Date | null;
  readonly version: number;
}

export interface CashMovementRecord {
  readonly id: Id;
  readonly type: CashMovementType;
  readonly paymentMethod: PaymentMethod;
  readonly amountCents: number;
  readonly reason: string | null;
  readonly userId: Id;
  readonly occurredAt: Date;
}

export interface NewCashMovement {
  readonly storeId: Id;
  readonly cashSessionId: Id;
  readonly type: CashMovementType;
  readonly paymentMethod: PaymentMethod;
  readonly amountCents: number;
  readonly paymentId: Id | null;
  readonly reason: string | null;
  readonly userId: Id;
  readonly authorizedBy: Id | null;
  readonly occurredAt: Date;
}

export interface LockOption {
  readonly forUpdate?: boolean;
}

/** Toda busca por id exige a LOJA (ADR-0009). */
export interface CashierRepository {
  findSession(
    tx: Transaction,
    scope: { storeId: Id; sessionId: Id },
    options?: LockOption,
  ): Promise<CashSessionRecord | null>;
  findOpenSessionOfTerminal(
    tx: Transaction,
    scope: { storeId: Id; terminalId: Id },
    options?: LockOption,
  ): Promise<CashSessionRecord | null>;
  /** Caixas abertos da loja, com trava (aberturas simultâneas entram em fila). */
  countOpenSessions(tx: Transaction, storeId: Id): Promise<number>;
  insertSession(
    tx: Transaction,
    session: Omit<CashSessionRecord, 'status' | 'closedBy' | 'closedAt' | 'version'>,
  ): Promise<void>;
  /** Fecha se a versão bate; false = outra pessoa alterou. */
  closeSession(
    tx: Transaction,
    scope: { storeId: Id; sessionId: Id; version: number },
    data: { by: Id; at: Date },
  ): Promise<boolean>;
  insertMovement(tx: Transaction, movement: NewCashMovement): Promise<void>;
  /** Soma COM SINAL por forma de pagamento; com trava = vê o último dado confirmado. */
  movementTotals(
    tx: Transaction,
    scope: { storeId: Id; sessionId: Id },
    options?: LockOption,
  ): Promise<MovementTotal[]>;
  /** Sangrias e suprimentos (o que a tela mostra antes do fechamento — sem vendas). */
  listManualMovements(
    tx: Transaction,
    scope: { storeId: Id; sessionId: Id },
  ): Promise<CashMovementRecord[]>;
  insertCounts(tx: Transaction, sessionId: Id, lines: readonly CountLine[]): Promise<void>;
  listCounts(tx: Transaction, scope: { storeId: Id; sessionId: Id }): Promise<CountLine[]>;
}

/** O que o caixa usa dos outros módulos (injetado — ADR-0014). */
export interface CashierDependencies {
  readonly db: Database;
  readonly repo: CashierRepository;
  readonly stores: {
    findStore(tx: Transaction, storeId: Id): Promise<StoreInfo | null>;
    settings(
      tx: Transaction,
      scope: { organizationId: Id; storeId: Id },
    ): Promise<StoreSettings | null>;
    /** Terminal ATIVO da loja vinculado ao aparelho (RN-ORG-11). */
    terminalOfDevice(
      tx: Transaction,
      storeId: Id,
      deviceId: Id,
    ): Promise<{ id: Id; code: string; name: string; kind: TerminalKind } | null>;
  };
  readonly userNames: (tx: Transaction, ids: readonly Id[]) => Promise<Map<Id, string>>;
}
