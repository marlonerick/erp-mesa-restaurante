// API pública do módulo Organizations (Etapa 2: base — E2-1; Etapa 3: completo).
import { type Database, getDatabase } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, RequestContext } from '@/shared/kernel';
import * as admin from './application/administration';
import type { OrganizationsDependencies, StoreAccess } from './application/ports';
import { DEFAULT_STORE_SETTINGS, type StoreSettings } from './domain/rules';
import { organizationsRepository as repo } from './infrastructure/organizations-repository';
import {
  findActiveStore,
  findStoreAnyStatus,
  insertCompany,
  insertOrganization,
  listActiveStores,
  type StoreInfo,
} from './infrastructure/store-repository';

export type { StoreInfo } from './infrastructure/store-repository';
export type {
  CompanyRecord,
  RecordStatus,
  StoreAccess,
  StoreRecord,
  StoreScope,
} from './application/ports';
export type { TerminalView } from './application/administration';
export {
  BRAZIL_TIMEZONES,
  DEFAULT_STORE_SETTINGS,
  formatPercent,
  MAX_OPEN_CASH_LIMIT,
  NEGATIVE_STOCK_POLICIES,
  type NegativeStockPolicy,
  parsePercentText,
  type StoreSettings,
  TERMINAL_KINDS,
  type TerminalKind,
} from './domain/rules';

// ---- Consultas usadas por outros módulos ----

export function getStore(tx: Transaction, storeId: Id): Promise<StoreInfo | null> {
  return findActiveStore(tx, storeId);
}

/** Inclui lojas desativadas (ex.: conferir perfis antigos de uma pessoa). */
export function getStoreAnyStatus(tx: Transaction, storeId: Id): Promise<StoreInfo | null> {
  return findStoreAnyStatus(tx, storeId);
}

export function listStores(tx: Transaction, organizationId: Id): Promise<StoreInfo[]> {
  return listActiveStores(tx, organizationId);
}

/** Configurações da loja (RN-ORG-04) — dia operacional, taxa de serviço, estoque, caixas. */
export async function getStoreSettings(
  tx: Transaction,
  storeId: Id,
): Promise<StoreSettings | null> {
  const found = await repo.findStoreRecord(tx, storeId);
  return found
    ? {
        timezone: found.timezone,
        operationalDayCutoff: found.operationalDayCutoff,
        serviceFeeBp: found.serviceFeeBp,
        negativeStockPolicy: found.negativeStockPolicy,
        maxOpenCashSessions: found.maxOpenCashSessions,
      }
    : null;
}

/** Terminal ATIVO da loja vinculado ao aparelho (RN-ORG-11); senão null. */
export async function findTerminalOfDevice(
  tx: Transaction,
  storeId: Id,
  deviceId: Id,
): Promise<{ id: Id; code: string; name: string } | null> {
  const found = await repo.findTerminalByDevice(tx, deviceId);
  return found?.active && found.storeId === storeId
    ? { id: found.id, code: found.code, name: found.name }
    : null;
}

// ---- Primeira instalação e seed ----

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
  const storeId = await addStore(tx, {
    organizationId,
    companyId,
    name: input.storeName,
    code: input.storeCode,
  });
  return { organizationId, companyId, storeId };
}

/** Loja com as configurações padrão e a estação "Cozinha" (seed, testes, instalação). */
export function addStore(
  tx: Transaction,
  input: { organizationId: Id; companyId: Id; name: string; code: string },
): Promise<Id> {
  return admin.insertStoreWithStation({ repo }, tx, { ...DEFAULT_STORE_SETTINGS, ...input });
}

// ---- Administração (telas de empresa, lojas e terminais) ----

/**
 * Casos de uso de administração. `access` vem do módulo Authorization (injetado por quem monta a
 * tela), o que evita a dependência circular Organizations ↔ Authorization (ADR-0014).
 */
export function organizationAdministration(overrides: { db?: Database; access: StoreAccess }) {
  const deps: OrganizationsDependencies = {
    db: overrides.db ?? getDatabase().db,
    repo,
    access: overrides.access,
  };
  type Args<F> = F extends (d: OrganizationsDependencies, c: RequestContext, i: infer I) => unknown
    ? I
    : never;
  return {
    listCompanies: (ctx: RequestContext) => admin.listCompanies(deps, ctx),
    getCompany: (ctx: RequestContext, companyId: Id) => admin.getCompany(deps, ctx, companyId),
    createCompany: (ctx: RequestContext, input: Args<typeof admin.createCompany>) =>
      admin.createCompany(deps, ctx, input),
    updateCompany: (ctx: RequestContext, input: Args<typeof admin.updateCompany>) =>
      admin.updateCompany(deps, ctx, input),
    listStores: (ctx: RequestContext) => admin.listManageableStores(deps, ctx),
    getStore: (ctx: RequestContext, storeId: Id) => admin.getManageableStore(deps, ctx, storeId),
    createStore: (ctx: RequestContext, input: Args<typeof admin.createStore>) =>
      admin.createStore(deps, ctx, input),
    updateStore: (ctx: RequestContext, input: Args<typeof admin.updateStore>) =>
      admin.updateStore(deps, ctx, input),
    setStoreStatus: (ctx: RequestContext, input: Args<typeof admin.setStoreStatus>) =>
      admin.setStoreStatus(deps, ctx, input),
    listTerminals: (ctx: RequestContext) => admin.listTerminals(deps, ctx),
    getTerminal: (ctx: RequestContext, terminalId: Id) => admin.getTerminal(deps, ctx, terminalId),
    createTerminal: (ctx: RequestContext, input: Args<typeof admin.createTerminal>) =>
      admin.createTerminal(deps, ctx, input),
    updateTerminal: (ctx: RequestContext, input: Args<typeof admin.updateTerminal>) =>
      admin.updateTerminal(deps, ctx, input),
    setTerminalActive: (ctx: RequestContext, input: Args<typeof admin.setTerminalActive>) =>
      admin.setTerminalActive(deps, ctx, input),
    bindThisDevice: (ctx: RequestContext, input: Args<typeof admin.bindThisDevice>) =>
      admin.bindThisDevice(deps, ctx, input),
    unbindTerminal: (ctx: RequestContext, input: Args<typeof admin.unbindTerminal>) =>
      admin.unbindTerminal(deps, ctx, input),
  };
}

export type OrganizationAdministration = ReturnType<typeof organizationAdministration>;
