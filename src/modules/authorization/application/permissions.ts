import { getStore, listStores, type StoreInfo } from '@/modules/organizations';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, Permission } from '@/shared/kernel';
import { covers, resolveStorePermissions, type StoreScope } from '../domain/effective-permissions';
import type { AuthorizationRepository } from './ports';

/** Permissões efetivas do usuário numa loja (RN-AUTHZ-02). Loja inexistente/inativa: nenhuma. */
export async function permissionsInStore(
  repo: AuthorizationRepository,
  tx: Transaction,
  userId: Id,
  storeId: Id,
): Promise<Set<Permission>> {
  const store = await getStore(tx, storeId);
  if (!store) {
    return new Set();
  }
  return resolveStorePermissions(await repo.listUserGrants(tx, userId), store);
}

/** Lojas em que o usuário tem algum perfil, em ordem alfabética (RN-AUTH-14). */
export async function accessibleStores(
  repo: AuthorizationRepository,
  tx: Transaction,
  userId: Id,
  organizationId: Id,
): Promise<StoreInfo[]> {
  const grants = await repo.listUserGrants(tx, userId);
  const stores = await listStores(tx, organizationId);
  return stores.filter((store) => grants.some((grant) => covers(grant, store)));
}

/** Lojas (entre as informadas, de qualquer situação) em que a permissão vale (RN-AUTHZ-02). */
export async function storesWithPermission(
  repo: AuthorizationRepository,
  tx: Transaction,
  userId: Id,
  stores: readonly (StoreScope & { readonly id: Id })[],
  permission: Permission,
): Promise<Set<Id>> {
  const grants = (await repo.listUserGrants(tx, userId)).filter((grant) =>
    grant.permissions.includes(permission),
  );
  return new Set(
    stores.filter((store) => grants.some((grant) => covers(grant, store))).map((store) => store.id),
  );
}

/**
 * A permissão vale para a organização inteira (perfil de organização) ou, com `companyId`, para
 * toda a empresa (perfil de empresa)? Perfil só de loja não conta: administrar a empresa ou criar
 * lojas nela é mais amplo que uma loja.
 */
export async function hasCompanyWidePermission(
  repo: AuthorizationRepository,
  tx: Transaction,
  userId: Id,
  scope: { organizationId: Id; companyId: Id | null },
  permission: Permission,
): Promise<boolean> {
  const grants = await repo.listUserGrants(tx, userId);
  return grants.some(
    (grant) =>
      grant.permissions.includes(permission) &&
      ((grant.scopeType === 'ORGANIZATION' && grant.scopeId === scope.organizationId) ||
        (grant.scopeType === 'COMPANY' && grant.scopeId === scope.companyId)),
  );
}

/** Usuários com algum perfil que vale na loja, e os códigos desses perfis (isolamento RN-USERS-07). */
export async function usersInStore(
  repo: AuthorizationRepository,
  tx: Transaction,
  storeId: Id,
): Promise<Map<Id, string[]>> {
  const store = await getStore(tx, storeId);
  const result = new Map<Id, string[]>();
  if (!store) {
    return result;
  }
  const rows = await repo.listAssignmentsCovering(tx, {
    storeId: store.id,
    companyId: store.companyId,
    organizationId: store.organizationId,
  });
  for (const row of rows) {
    const roles = result.get(row.userId) ?? [];
    if (!roles.includes(row.roleCode)) {
      roles.push(row.roleCode);
    }
    result.set(row.userId, roles);
  }
  return result;
}
