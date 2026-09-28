import type { Permission } from '@/shared/kernel';

export type ScopeType = 'ORGANIZATION' | 'COMPANY' | 'STORE';

export interface ScopedGrant {
  readonly scopeType: ScopeType;
  readonly scopeId: string;
  readonly permissions: readonly Permission[];
}

export interface StoreScope {
  readonly id: string;
  readonly companyId: string;
  readonly organizationId: string;
}

function covers(grant: ScopedGrant, store: StoreScope): boolean {
  switch (grant.scopeType) {
    case 'STORE':
      return grant.scopeId === store.id;
    case 'COMPANY':
      return grant.scopeId === store.companyId;
    case 'ORGANIZATION':
      return grant.scopeId === store.organizationId;
  }
}

/** União das permissões dos perfis cujo escopo cobre a loja (RN-AUTHZ-02). */
export function resolveStorePermissions(
  grants: readonly ScopedGrant[],
  store: StoreScope,
): Set<Permission> {
  return new Set(
    grants.filter((grant) => covers(grant, store)).flatMap((grant) => grant.permissions),
  );
}

/** Anti-escalada: só atribui um perfil quem já possui todas as permissões dele (RN-AUTHZ-05). */
export function canAssignRole(
  actorPermissions: ReadonlySet<Permission>,
  rolePermissions: readonly Permission[],
): boolean {
  return rolePermissions.every((permission) => actorPermissions.has(permission));
}
