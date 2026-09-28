import { recordAuditFromContext } from '@/modules/audit';
import type { Transaction } from '@/shared/db/transaction';
import { DomainError, type Id, type RequestContext, SYSTEM_ROLES } from '@/shared/kernel';
import { canAssignRole } from '../domain/effective-permissions';
import type { AuthorizationRepository, RoleDefinition } from './ports';

function notAllowed(): DomainError {
  return new DomainError(
    'ROLE_ASSIGNMENT_NOT_ALLOWED',
    'Você não pode atribuir este perfil.',
    'FORBIDDEN',
  );
}

async function loadRoles(
  repo: AuthorizationRepository,
  tx: Transaction,
  codes: readonly string[],
): Promise<RoleDefinition[]> {
  const unique = [...new Set(codes)];
  const unknown = unique.filter((code) => !(SYSTEM_ROLES as readonly string[]).includes(code));
  const roles = await repo.findRolesByCodes(tx, unique);
  if (unknown.length > 0 || roles.length !== unique.length) {
    throw new DomainError('UNKNOWN_ROLE', 'Perfil desconhecido.', 'VALIDATION', { codes: unknown });
  }
  return roles;
}

/**
 * Define exatamente quais perfis o usuário tem na loja ATIVA de quem executa.
 * Anti-escalada (RN-AUTHZ-05): cada perfil incluído OU removido precisa estar ao alcance de quem
 * altera. Perfis de organização/empresa não são mexidos aqui.
 */
export async function replaceStoreRoles(
  repo: AuthorizationRepository,
  tx: Transaction,
  ctx: RequestContext,
  userId: Id,
  roleCodes: readonly string[],
): Promise<void> {
  const desired = await loadRoles(repo, tx, roleCodes);
  const currentCodes = await repo.listStoreRoleCodes(tx, userId, ctx.storeId);
  const current = await loadRoles(repo, tx, currentCodes);

  const added = desired.filter((r) => !currentCodes.includes(r.code));
  const removed = current.filter((r) => !desired.some((d) => d.code === r.code));
  if ([...added, ...removed].some((r) => !canAssignRole(ctx.permissions, r.permissions))) {
    throw notAllowed();
  }
  if (added.length === 0 && removed.length === 0) {
    return;
  }

  for (const r of added) {
    await repo.insertAssignment(tx, {
      userId,
      roleId: r.id,
      scopeType: 'STORE',
      scopeId: ctx.storeId,
      createdBy: ctx.userId,
    });
  }
  for (const r of removed) {
    await repo.deleteStoreAssignment(tx, { userId, roleId: r.id, storeId: ctx.storeId });
  }

  await recordAuditFromContext(tx, ctx, 'ROLE_CHANGED', {
    entityType: 'app_user',
    entityId: userId,
    before: { roles: [...currentCodes].sort() },
    after: { roles: desired.map((r) => r.code).sort() },
  });
}

/** Perfil com escopo de organização — usado só na instalação (primeiro ADMIN) e no seed. */
export async function grantOrganizationRole(
  repo: AuthorizationRepository,
  tx: Transaction,
  input: { userId: Id; roleCode: string; organizationId: Id; createdBy: Id | null },
): Promise<void> {
  const [roleDefinition] = await loadRoles(repo, tx, [input.roleCode]);
  if (!roleDefinition) throw notAllowed();
  await repo.insertAssignment(tx, {
    userId: input.userId,
    roleId: roleDefinition.id,
    scopeType: 'ORGANIZATION',
    scopeId: input.organizationId,
    createdBy: input.createdBy,
  });
}

/** Perfil em uma loja, sem contexto de usuário — usado só no seed de desenvolvimento e em testes. */
export async function grantStoreRoleUnchecked(
  repo: AuthorizationRepository,
  tx: Transaction,
  input: { userId: Id; roleCode: string; storeId: Id },
): Promise<void> {
  const [roleDefinition] = await loadRoles(repo, tx, [input.roleCode]);
  if (!roleDefinition) throw notAllowed();
  await repo.insertAssignment(tx, {
    userId: input.userId,
    roleId: roleDefinition.id,
    scopeType: 'STORE',
    scopeId: input.storeId,
    createdBy: null,
  });
}
