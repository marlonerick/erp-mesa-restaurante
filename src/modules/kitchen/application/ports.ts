import type { KitchenPort } from '@/modules/orders';
import type { StoreInfo, StoreSettings } from '@/modules/organizations';
import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id } from '@/shared/kernel';

/** O que a cozinha usa dos outros módulos (injetado — ADR-0014). */
export interface KitchenDependencies {
  readonly db: Database;
  /** Tickets e itens são do Orders (a cozinha usa a API dele na transação). */
  readonly orders: KitchenPort;
  readonly stores: {
    findStore(tx: Transaction, storeId: Id): Promise<StoreInfo | null>;
    settings(
      tx: Transaction,
      scope: { organizationId: Id; storeId: Id },
    ): Promise<StoreSettings | null>;
    defaultStation(tx: Transaction, storeId: Id): Promise<{ id: Id; name: string } | null>;
  };
  readonly userNames: (tx: Transaction, ids: readonly Id[]) => Promise<Map<Id, string>>;
}
