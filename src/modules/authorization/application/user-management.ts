import { getStoreAnyStatus } from '@/modules/organizations';
import type { Transaction } from '@/shared/db/transaction';
import { DomainError, type Id, type Permission, type RequestContext } from '@/shared/kernel';
import { canAssignRole, resolveStorePermissions } from '../domain/effective-permissions';
import type { AuthorizationRepository, UserGrant } from './ports';

/** Permissões que quem age tem num escopo que INCLUI o escopo do perfil do alvo. */
async function actorPermissionsOver(
  tx: Transaction,
  actorGrants: readonly UserGrant[],
  target: UserGrant,
): Promise<Set<Permission>> {
  const union = (grants: readonly UserGrant[]) => new Set(grants.flatMap((g) => g.permissions));
  switch (target.scopeType) {
    case 'ORGANIZATION':
      return union(
        actorGrants.filter((g) => g.scopeType === 'ORGANIZATION' && g.scopeId === target.scopeId),
      );
    case 'COMPANY':
      // Perfis por empresa ainda não são usados; só quem tem perfil na organização ou nessa empresa
      return union(
        actorGrants.filter(
          (g) =>
            g.scopeType === 'ORGANIZATION' ||
            (g.scopeType === 'COMPANY' && g.scopeId === target.scopeId),
        ),
      );
    case 'STORE': {
      // Inclui loja desativada: o perfil antigo ainda precisa ser "alcançável" por quem está acima
      // (senão nem o ADMIN conseguiria desativar quem trabalhou numa loja fechada)
      const store = await getStoreAnyStatus(tx, target.scopeId);
      return store ? resolveStorePermissions(actorGrants, store) : new Set();
    }
  }
}

/**
 * Quem age precisa "estar acima" do alvo (RN-AUTHZ-05, achado B1 da revisão): para CADA perfil do
 * alvo — em qualquer loja, empresa ou na organização — quem age precisa ter, num escopo que inclui
 * aquele, todas as permissões daquele perfil. Assim um gerente de loja não redefine a senha do
 * ADMIN da organização nem de quem é gerente em outra loja.
 */
export async function assertCanManageUser(
  repo: AuthorizationRepository,
  tx: Transaction,
  ctx: RequestContext,
  targetUserId: Id,
): Promise<void> {
  const actorGrants = await repo.listUserGrants(tx, ctx.userId);
  const targetGrants = await repo.listUserGrants(tx, targetUserId);
  for (const grant of targetGrants) {
    const actorPermissions = await actorPermissionsOver(tx, actorGrants, grant);
    if (!canAssignRole(actorPermissions, grant.permissions)) {
      throw new DomainError(
        'USER_MANAGEMENT_NOT_ALLOWED',
        'Você não pode alterar este usuário: ele tem perfis acima dos seus ou em outra loja.',
        'FORBIDDEN',
      );
    }
  }
}
