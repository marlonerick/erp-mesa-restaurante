// API pública do módulo Authorization. Liga os casos de uso ao repositório real.
import type { StoreAccess, StoreInfo } from '@/modules/organizations';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, Permission, RequestContext } from '@/shared/kernel';
import {
  type AuthorizationOutcome,
  authorizeOrElevate as authorizeOrElevateUseCase,
  ELEVATED_GRANT_TTL_SECONDS,
} from './application/elevation';
import type { NewElevatedGrant } from './application/ports';
import {
  accessibleStores,
  companyWideScope,
  permissionsInStore,
  storesWithPermission,
  usersInStore,
} from './application/permissions';
import {
  grantOrganizationRole as grantOrganizationRoleUseCase,
  grantStoreRoleUnchecked as grantStoreRoleUseCase,
  replaceStoreRoles as replaceStoreRolesUseCase,
} from './application/role-assignment';
import { assertCanManageUser as assertCanManageUserUseCase } from './application/user-management';
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

/** Consulta de permissões injetada na administração de empresa/lojas (Organizations, ADR-0014). */
export const storeAccess: StoreAccess = {
  storesWithPermission: (tx, userId, stores, permission) =>
    storesWithPermission(repo, tx, userId, stores, permission),
  companyWideScope: (tx, userId, organizationId, permission) =>
    companyWideScope(repo, tx, userId, organizationId, permission),
};

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

export const purgeExpiredElevatedGrants = (tx: Transaction, before: Date) =>
  repo.purgeElevatedGrants(tx, before);

/** Guarda "quem age está acima do alvo" para alterar, redefinir senha ou desativar usuários. */
export const assertCanManageUser = (tx: Transaction, ctx: RequestContext, targetUserId: Id) =>
  assertCanManageUserUseCase(repo, tx, ctx, targetUserId);

export const authorizeOrElevate = (
  tx: Transaction,
  ctx: RequestContext,
  permission: Permission,
  grantToken: string | null,
): Promise<AuthorizationOutcome> =>
  authorizeOrElevateUseCase(repo, tx, ctx, permission, grantToken);
