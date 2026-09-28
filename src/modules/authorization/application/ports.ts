import type { Transaction } from '@/shared/db/transaction';
import type { Id, Permission } from '@/shared/kernel';
import type { ScopeType } from '../domain/effective-permissions';

export interface RoleDefinition {
  readonly id: Id;
  readonly code: string;
  readonly permissions: readonly Permission[];
}

export interface UserGrant {
  readonly roleCode: string;
  readonly scopeType: ScopeType;
  readonly scopeId: Id;
  readonly permissions: readonly Permission[];
}

export interface AssignmentRow {
  readonly userId: Id;
  readonly roleCode: string;
  readonly scopeType: ScopeType;
}

export interface NewElevatedGrant {
  readonly tokenHash: string;
  readonly storeId: Id;
  readonly permission: Permission;
  readonly requesterUserId: Id;
  readonly requesterSessionId: Id;
  readonly authorizerUserId: Id;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/** O que a camada de aplicação precisa do banco (implementado em infrastructure/). */
export interface AuthorizationRepository {
  findRolesByCodes(tx: Transaction, codes: readonly string[]): Promise<RoleDefinition[]>;
  listUserGrants(tx: Transaction, userId: Id): Promise<UserGrant[]>;
  listAssignmentsCovering(
    tx: Transaction,
    scope: { storeId: Id; companyId: Id; organizationId: Id },
  ): Promise<AssignmentRow[]>;
  listStoreRoleCodes(tx: Transaction, userId: Id, storeId: Id): Promise<string[]>;
  insertAssignment(
    tx: Transaction,
    input: { userId: Id; roleId: Id; scopeType: ScopeType; scopeId: Id; createdBy: Id | null },
  ): Promise<void>;
  deleteStoreAssignment(
    tx: Transaction,
    input: { userId: Id; roleId: Id; storeId: Id },
  ): Promise<void>;
  insertElevatedGrant(tx: Transaction, grant: NewElevatedGrant): Promise<void>;
  /** Marca como usada; devolve o autorizador ou null se inválida/usada/expirada/de outra sessão. */
  consumeElevatedGrant(
    tx: Transaction,
    input: { tokenHash: string; sessionId: Id; storeId: Id; permission: Permission; now: Date },
  ): Promise<Id | null>;
}
