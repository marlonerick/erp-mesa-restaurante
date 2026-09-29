import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, Permission } from '@/shared/kernel';
import type { StoreSettings, TerminalKind } from '../domain/rules';

export type RecordStatus = 'ATIVO' | 'INATIVO';

export interface CompanyRecord {
  readonly id: Id;
  readonly organizationId: Id;
  readonly legalName: string;
  readonly tradeName: string;
  readonly cnpj: string | null;
  readonly status: RecordStatus;
  readonly version: number;
}

export interface CompanyData {
  readonly legalName: string;
  readonly tradeName: string;
  readonly cnpj: string | null;
}

export interface StoreData extends StoreSettings {
  readonly name: string;
  readonly code: string;
}

export interface StoreRecord extends StoreData {
  readonly id: Id;
  readonly organizationId: Id;
  readonly companyId: Id;
  readonly status: RecordStatus;
  readonly version: number;
}

export interface TerminalData {
  readonly code: string;
  readonly name: string;
  readonly kind: TerminalKind;
}

export interface TerminalRecord extends TerminalData {
  readonly id: Id;
  readonly storeId: Id;
  readonly deviceId: Id | null;
  readonly active: boolean;
  readonly version: number;
}

/** O que a aplicação precisa do banco (implementado em infrastructure/). */
export interface OrganizationsRepository {
  listCompanies(tx: Transaction, organizationId: Id): Promise<CompanyRecord[]>;
  findCompany(tx: Transaction, companyId: Id): Promise<CompanyRecord | null>;
  insertCompany(
    tx: Transaction,
    input: CompanyData & { id: Id; organizationId: Id },
  ): Promise<void>;
  /** UPDATE condicional à versão (ADR-0008). false = outra pessoa alterou antes. */
  updateCompany(tx: Transaction, id: Id, version: number, data: CompanyData): Promise<boolean>;

  listStoresAnyStatus(tx: Transaction, organizationId: Id): Promise<StoreRecord[]>;
  findStoreRecord(tx: Transaction, storeId: Id): Promise<StoreRecord | null>;
  insertStore(
    tx: Transaction,
    input: StoreData & { id: Id; organizationId: Id; companyId: Id },
  ): Promise<void>;
  updateStore(tx: Transaction, id: Id, version: number, data: StoreData): Promise<boolean>;
  setStoreStatus(tx: Transaction, id: Id, version: number, status: RecordStatus): Promise<boolean>;
  countActiveStores(tx: Transaction, organizationId: Id): Promise<number>;
  insertDefaultStation(tx: Transaction, storeId: Id): Promise<void>;

  listTerminals(tx: Transaction, storeId: Id): Promise<TerminalRecord[]>;
  findTerminal(tx: Transaction, terminalId: Id): Promise<TerminalRecord | null>;
  /** Terminal ao qual o aparelho está vinculado, em qualquer loja (RN-ORG-09). */
  findTerminalByDevice(tx: Transaction, deviceId: Id): Promise<TerminalRecord | null>;
  insertTerminal(tx: Transaction, input: TerminalData & { id: Id; storeId: Id }): Promise<void>;
  updateTerminal(tx: Transaction, id: Id, version: number, data: TerminalData): Promise<boolean>;
  /** Ativa/desativa; desativar também desfaz o vínculo com o aparelho (RN-ORG-08). */
  setTerminalActive(tx: Transaction, id: Id, version: number, active: boolean): Promise<boolean>;
  setTerminalDevice(tx: Transaction, id: Id, deviceId: Id | null): Promise<void>;
}

export interface StoreScope {
  readonly id: Id;
  readonly companyId: Id;
  readonly organizationId: Id;
}

/**
 * Consulta de permissões por escopo, implementada pelo módulo Authorization e INJETADA (Authorization
 * já depende de Organizations; injetar evita a dependência circular — ADR-0014).
 */
export interface StoreAccess {
  /** Lojas (entre `stores`) em que a permissão vale para o usuário — inclusive desativadas. */
  storesWithPermission(
    tx: Transaction,
    userId: Id,
    stores: readonly StoreScope[],
    permission: Permission,
  ): Promise<Set<Id>>;
  /**
   * A permissão vale para a organização inteira ou, se `companyId` for informado, para toda essa
   * empresa (perfil de organização ou de empresa)?
   */
  hasCompanyWidePermission(
    tx: Transaction,
    userId: Id,
    scope: { organizationId: Id; companyId: Id | null },
    permission: Permission,
  ): Promise<boolean>;
}

export interface OrganizationsDependencies {
  readonly db: Database;
  readonly repo: OrganizationsRepository;
  readonly access: StoreAccess;
}
