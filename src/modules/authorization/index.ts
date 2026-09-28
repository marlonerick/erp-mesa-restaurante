// API pública do módulo Authorization. Liga os casos de uso ao repositório real.
import type { StoreInfo } from '@/modules/organizations';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, Permission, RequestContext } from '@/shared/kernel';
import {
  type AuthorizationOutcome,
  authorizeOrElevate as authorizeOrElevateUseCase,
  ELEVATED_GRANT_TTL_SECONDS,
} from './application/elevation';
import type { NewElevatedGrant } from './application/ports';
import { accessibleStores, permissionsInStore, usersInStore } from './application/permissions';
import {
  grantOrganizationRole as grantOrganizationRoleUseCase,
  grantStoreRoleUnchecked as grantStoreRoleUseCase,
  replaceStoreRoles as replaceStoreRolesUseCase,
} from './application/role-assignment';
import { authorizationRepository as repo } from './infrastructure/authorization-repository';

export { type AuthorizationOutcome, ELEVATED_GRANT_TTL_SECONDS };
export type { NewElevatedGrant };

export const getPermissionsInStore = (tx: Transaction, userId: Id, storeId: Id) =>
  permissionsInStore(repo, tx, userId, storeId);

export const getAccessibleStores = (
  tx: Transaction,
  userId: Id,
  organizationId: Id,
): Promise<StoreInfo[]> => accessibleStores(repo, tx, userId, organizationId);

export const getUsersInStore = (tx: Transaction, storeId: Id) => usersInStore(repo, tx, storeId);

export const getStoreRoleCodes = (tx: Transaction, userId: Id, storeId: Id) =>
  repo.listStoreRoleCodes(tx, userId, storeId);

export const replaceStoreRoles = (
  tx: Transaction,
  ctx: RequestContext,
  userId: Id,
  roleCodes: readonly string[],
) => replaceStoreRolesUseCase(repo, tx, ctx, userId, roleCodes);

export const grantOrganizationRole = (
  tx: Transaction,
  input: { userId: Id; roleCode: string; organizationId: Id; createdBy: Id | null },
) => grantOrganizationRoleUseCase(repo, tx, input);

export const grantStoreRoleUnchecked = (
  tx: Transaction,
  input: { userId: Id; roleCode: string; storeId: Id },
) => grantStoreRoleUseCase(repo, tx, input);

export const saveElevatedGrant = (tx: Transaction, grant: NewElevatedGrant) =>
  repo.insertElevatedGrant(tx, grant);

export const authorizeOrElevate = (
  tx: Transaction,
  ctx: RequestContext,
  permission: Permission,
  grantToken: string | null,
): Promise<AuthorizationOutcome> =>
  authorizeOrElevateUseCase(repo, tx, ctx, permission, grantToken);
