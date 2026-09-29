import type { StoreInfo, StoreSettings } from '@/modules/organizations';
import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { BaseUnit, Id } from '@/shared/kernel';

// Quantidades em MILÉSIMOS da unidade base (number) e custos em MICRO-REAIS por unidade (bigint):
// o repositório converte DECIMAL ⇄ inteiros sem passar por float (ADR-0003).

export type MovementType =
  'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'PERDA' | 'CONSUMO_VENDA' | 'ESTORNO_VENDA';

export type MovementLossReason =
  'VENCIDO' | 'ESTRAGADO' | 'ERRO_PREPARO' | 'QUEBRA' | 'OUTRO' | 'CANCELAMENTO_APOS_PREPARO';

export type OriginType = 'MANUAL' | 'ORDER_ITEM';

export interface IngredientRecord {
  readonly id: Id;
  readonly companyId: Id;
  readonly name: string;
  readonly baseUnit: BaseUnit;
  readonly active: boolean;
  readonly version: number;
}

export interface ConversionRecord {
  readonly id: Id;
  readonly ingredientId: Id;
  readonly unitName: string;
  readonly factorThousandths: number;
}

export interface StockRecord {
  readonly storeId: Id;
  readonly ingredientId: Id;
  readonly quantity: number;
  readonly avgCostMicros: bigint;
  readonly minQuantity: number;
}

/** Insumo com a situação na loja (sem linha de saldo = zeros). */
export interface IngredientWithStock extends IngredientRecord {
  readonly quantity: number;
  readonly avgCostMicros: bigint;
  readonly minQuantity: number;
}

export interface NewMovement {
  readonly id: Id;
  readonly storeId: Id;
  readonly ingredientId: Id;
  readonly type: MovementType;
  readonly quantity: number;
  readonly unitCostMicros: bigint;
  readonly valueCents: number;
  readonly balanceAfter: number;
  readonly lossReason: MovementLossReason | null;
  readonly note: string | null;
  readonly enteredText: string | null;
  readonly originType: OriginType;
  readonly originId: Id | null;
  readonly userId: Id;
  readonly occurredAt: Date;
  readonly operationalDate: string;
}

export type MovementRecord = Omit<NewMovement, 'storeId' | 'ingredientId'>;

export interface InventoryRepository {
  listIngredients(
    tx: Transaction,
    filter: { companyId: Id; storeId: Id; search: string | null; includeInactive: boolean },
  ): Promise<IngredientWithStock[]>;
  findIngredient(
    tx: Transaction,
    scope: { companyId: Id; ingredientId: Id },
  ): Promise<IngredientRecord | null>;
  findIngredients(tx: Transaction, companyId: Id, ids: readonly Id[]): Promise<IngredientRecord[]>;
  insertIngredient(
    tx: Transaction,
    input: { id: Id; companyId: Id; name: string; baseUnit: BaseUnit },
  ): Promise<void>;
  updateIngredient(
    tx: Transaction,
    id: Id,
    version: number,
    data: { name: string; active: boolean },
  ): Promise<boolean>;

  listConversions(tx: Transaction, ingredientId: Id): Promise<ConversionRecord[]>;
  /** Conversão de um insumo DA EMPRESA. */
  findConversion(
    tx: Transaction,
    scope: { companyId: Id; conversionId: Id },
  ): Promise<ConversionRecord | null>;
  insertConversion(tx: Transaction, input: ConversionRecord): Promise<void>;
  deleteConversion(tx: Transaction, id: Id): Promise<void>;

  findStock(tx: Transaction, storeId: Id, ingredientId: Id): Promise<StockRecord | null>;
  /**
   * Garante a linha de saldo e a lê COM TRAVA, na ordem dos ids (evita deadlock — ADR-0007).
   * Devolve um mapa ingrediente → saldo.
   */
  lockStock(
    tx: Transaction,
    storeId: Id,
    ingredientIds: readonly Id[],
  ): Promise<Map<Id, StockRecord>>;
  saveStock(
    tx: Transaction,
    input: { storeId: Id; ingredientId: Id; quantity: number; avgCostMicros: bigint },
  ): Promise<void>;
  setMinimum(
    tx: Transaction,
    input: { storeId: Id; ingredientId: Id; minQuantity: number },
  ): Promise<void>;

  insertMovements(tx: Transaction, rows: readonly NewMovement[]): Promise<void>;
  listMovements(
    tx: Transaction,
    scope: { storeId: Id; ingredientId: Id; limit: number },
  ): Promise<MovementRecord[]>;
  /**
   * Consumos e estornos já gravados de uma origem (item do pedido) na loja, lidos COM TRAVA: a
   * idempotência do estorno não depende da trava de quem chama (achado B-1).
   */
  saleMovementsOf(
    tx: Transaction,
    scope: { storeId: Id; originType: OriginType; originId: Id },
  ): Promise<(MovementRecord & { ingredientId: Id })[]>;
  /** Soma dos valores (centavos) dos tipos no período de dias operacionais (inclusive). */
  sumValues(
    tx: Transaction,
    scope: { storeId: Id; from: string; to: string; types: readonly MovementType[] },
  ): Promise<number>;
}

/** O que o estoque usa do Organizations: loja ativa (→ empresa) e configurações. */
export interface StoreDirectory {
  findStore(tx: Transaction, storeId: Id): Promise<StoreInfo | null>;
  settings(
    tx: Transaction,
    scope: { organizationId: Id; storeId: Id },
  ): Promise<StoreSettings | null>;
}

/** Nomes de quem fez as movimentações (módulo Users). */
export type UserNames = (tx: Transaction, ids: readonly Id[]) => Promise<Map<Id, string>>;

export interface InventoryDependencies {
  readonly db: Database;
  readonly repo: InventoryRepository;
  readonly stores: StoreDirectory;
  readonly userNames: UserNames;
}
