import { and, asc, eq } from 'drizzle-orm';
import { company, organization, store } from '@/shared/db/schema';
import type { Transaction } from '@/shared/db/transaction';
import { type Id, newId } from '@/shared/kernel';

export interface StoreInfo {
  readonly id: Id;
  readonly companyId: Id;
  readonly organizationId: Id;
  readonly name: string;
  readonly code: string;
  readonly timezone: string;
}

const storeColumns = {
  id: store.id,
  companyId: store.companyId,
  organizationId: store.organizationId,
  name: store.name,
  code: store.code,
  timezone: store.timezone,
};

/** Loja em qualquer situação (ativa ou não) — para regras que olham o histórico de perfis. */
export async function findStoreAnyStatus(tx: Transaction, storeId: Id): Promise<StoreInfo | null> {
  const [row] = await tx.select(storeColumns).from(store).where(eq(store.id, storeId));
  return row ?? null;
}

export async function findActiveStore(tx: Transaction, storeId: Id): Promise<StoreInfo | null> {
  const [row] = await tx
    .select(storeColumns)
    .from(store)
    .where(and(eq(store.id, storeId), eq(store.status, 'ATIVO')));
  return row ?? null;
}

export function listActiveStores(tx: Transaction, organizationId: Id): Promise<StoreInfo[]> {
  return tx
    .select(storeColumns)
    .from(store)
    .where(and(eq(store.organizationId, organizationId), eq(store.status, 'ATIVO')))
    .orderBy(asc(store.name));
}

export async function insertOrganization(tx: Transaction, name: string): Promise<Id> {
  const id = newId();
  await tx.insert(organization).values({ id, name });
  return id;
}

export async function insertCompany(
  tx: Transaction,
  input: { organizationId: Id; legalName: string; tradeName: string; cnpj: string | null },
): Promise<Id> {
  const id = newId();
  await tx.insert(company).values({ id, ...input });
  return id;
}

export async function insertStore(
  tx: Transaction,
  input: { organizationId: Id; companyId: Id; name: string; code: string },
): Promise<Id> {
  const id = newId();
  await tx.insert(store).values({ id, ...input });
  return id;
}
