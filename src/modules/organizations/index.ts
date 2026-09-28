// API pública do módulo Organizations (parte mínima da Etapa 2 — E2-1).
import type { Transaction } from '@/shared/db/transaction';
import type { Id } from '@/shared/kernel';
import {
  findActiveStore,
  insertCompany,
  insertOrganization,
  insertStore,
  listActiveStores,
  type StoreInfo,
} from './infrastructure/store-repository';

export type { StoreInfo } from './infrastructure/store-repository';

export function getStore(tx: Transaction, storeId: Id): Promise<StoreInfo | null> {
  return findActiveStore(tx, storeId);
}

export function listStores(tx: Transaction, organizationId: Id): Promise<StoreInfo[]> {
  return listActiveStores(tx, organizationId);
}

export interface NewOrganization {
  readonly organizationName: string;
  readonly companyLegalName: string;
  readonly companyTradeName: string;
  readonly cnpj: string | null;
  readonly storeName: string;
  readonly storeCode: string;
}

/** Primeira instalação: organização + empresa + loja (comando admin:create e seed). */
export async function createOrganizationWithStore(
  tx: Transaction,
  input: NewOrganization,
): Promise<{ organizationId: Id; companyId: Id; storeId: Id }> {
  const organizationId = await insertOrganization(tx, input.organizationName);
  const companyId = await insertCompany(tx, {
    organizationId,
    legalName: input.companyLegalName,
    tradeName: input.companyTradeName,
    cnpj: input.cnpj,
  });
  const storeId = await insertStore(tx, {
    organizationId,
    companyId,
    name: input.storeName,
    code: input.storeCode,
  });
  return { organizationId, companyId, storeId };
}

export function addStore(
  tx: Transaction,
  input: { organizationId: Id; companyId: Id; name: string; code: string },
): Promise<Id> {
  return insertStore(tx, input);
}
