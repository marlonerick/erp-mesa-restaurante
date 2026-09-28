import { recordAuditFromContext } from '@/modules/audit';
import { getStoreRoleCodes, getUsersInStore, replaceStoreRoles } from '@/modules/authorization';
import { MYSQL_ERRNO, mysqlErrno } from '@/shared/db/mysql-errors';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import {
  DomainError,
  type Id,
  newId,
  type RequestContext,
  requirePermission,
} from '@/shared/kernel';
import { validateNewPassword } from '../domain/password-policy';
import { normalizeUsername } from '../domain/username';
import type { UserRecord, UsersDependencies, UserStatus } from './ports';

export interface UserSummary {
  readonly id: Id;
  readonly name: string;
  readonly username: string;
  readonly status: UserStatus;
  readonly roles: readonly string[];
}

function normalizeName(input: string): string {
  const name = input.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) {
    throw new DomainError(
      'INVALID_NAME',
      'Informe um nome entre 2 e 120 caracteres.',
      'VALIDATION',
    );
  }
  return name;
}

function requireRoles(roleCodes: readonly string[]): void {
  if (roleCodes.length === 0) {
    throw new DomainError('ROLE_REQUIRED', 'Escolha ao menos um perfil.', 'VALIDATION');
  }
}

const notFound = () => new DomainError('USER_NOT_FOUND', 'Usuário não encontrado.', 'NOT_FOUND');

/** Só enxerga usuários com perfil que vale na loja ativa (isolamento RN-USERS-07). */
async function findVisibleUser(
  deps: UsersDependencies,
  tx: Transaction,
  ctx: RequestContext,
  userId: Id,
): Promise<UserRecord> {
  const inStore = await getUsersInStore(tx, ctx.storeId);
  const user = inStore.has(userId) ? await deps.repo.findById(tx, userId) : null;
  if (user?.organizationId !== ctx.organizationId) {
    throw notFound();
  }
  return user;
}

export async function listUsers(
  deps: UsersDependencies,
  ctx: RequestContext,
): Promise<UserSummary[]> {
  requirePermission(ctx, 'users.read');
  return runInTransaction(deps.db, async (tx) => {
    const rolesByUser = await getUsersInStore(tx, ctx.storeId);
    const users = await deps.repo.findManyByIds(tx, [...rolesByUser.keys()]);
    return users
      .filter((user) => user.organizationId === ctx.organizationId)
      .map((user) => ({
        id: user.id,
        name: user.name,
        username: user.username,
        status: user.status,
        roles: [...(rolesByUser.get(user.id) ?? [])].sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });
}

export interface UserDetail extends UserSummary {
  /** Perfis atribuídos diretamente NESTA loja (os únicos editáveis na tela). */
  readonly storeRoles: readonly string[];
}

export async function getUser(
  deps: UsersDependencies,
  ctx: RequestContext,
  userId: Id,
): Promise<UserDetail> {
  requirePermission(ctx, 'users.read');
  return runInTransaction(deps.db, async (tx) => {
    const user = await findVisibleUser(deps, tx, ctx, userId);
    const roles = (await getUsersInStore(tx, ctx.storeId)).get(user.id) ?? [];
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      status: user.status,
      roles: [...roles].sort(),
      storeRoles: (await getStoreRoleCodes(tx, user.id, ctx.storeId)).sort(),
    };
  });
}

export async function createUser(
  deps: UsersDependencies,
  ctx: RequestContext,
  input: {
    name: string;
    username: string;
    temporaryPassword: string;
    roleCodes: readonly string[];
  },
): Promise<{ id: Id }> {
  requirePermission(ctx, 'users.create');
  const name = normalizeName(input.name);
  const username = normalizeUsername(input.username);
  validateNewPassword(input.temporaryPassword, username);
  requireRoles(input.roleCodes);
  // Hash fora da transação: é o passo mais lento e não precisa segurar o banco
  const passwordHash = await deps.hasher.hash(input.temporaryPassword);

  const id = newId();
  try {
    await runInTransaction(deps.db, async (tx) => {
      if (await deps.repo.findByUsername(tx, username)) {
        throw usernameTaken();
      }
      await deps.repo.insert(tx, {
        id,
        organizationId: ctx.organizationId,
        name,
        username,
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: ctx.clock.now(),
        createdBy: ctx.userId,
      });
      await replaceStoreRoles(tx, ctx, id, input.roleCodes);
      await recordAuditFromContext(tx, ctx, 'USER_CREATED', {
        entityType: 'app_user',
        entityId: id,
        after: { name, username },
      });
    });
  } catch (error) {
    // Dois cadastros simultâneos com o mesmo usuário: o índice único do banco decide
    if (mysqlErrno(error) === MYSQL_ERRNO.DUPLICATE_ENTRY) throw usernameTaken();
    throw error;
  }
  return { id };
}

function usernameTaken(): DomainError {
  return new DomainError('USERNAME_TAKEN', 'Este nome de usuário já está em uso.', 'CONFLICT');
}

export async function renameUser(
  deps: UsersDependencies,
  ctx: RequestContext,
  input: { userId: Id; name: string },
): Promise<void> {
  requirePermission(ctx, 'users.update');
  const name = normalizeName(input.name);
  await runInTransaction(deps.db, async (tx) => {
    const user = await findVisibleUser(deps, tx, ctx, input.userId);
    if (user.name === name) return;
    await deps.repo.updateName(tx, user.id, name);
    await recordAuditFromContext(tx, ctx, 'USER_UPDATED', {
      entityType: 'app_user',
      entityId: user.id,
      before: { name: user.name },
      after: { name },
    });
  });
}

export async function setUserRoles(
  deps: UsersDependencies,
  ctx: RequestContext,
  input: { userId: Id; roleCodes: readonly string[] },
): Promise<void> {
  requirePermission(ctx, 'users.update');
  if (input.userId === ctx.userId) {
    throw new DomainError(
      'CANNOT_CHANGE_OWN_ROLES',
      'Você não pode alterar os seus próprios perfis.',
      'BUSINESS_RULE',
    );
  }
  await runInTransaction(deps.db, async (tx) => {
    const user = await findVisibleUser(deps, tx, ctx, input.userId);
    await replaceStoreRoles(tx, ctx, user.id, input.roleCodes);
  });
}

export async function resetUserPassword(
  deps: UsersDependencies,
  ctx: RequestContext,
  input: { userId: Id; temporaryPassword: string },
): Promise<void> {
  requirePermission(ctx, 'users.update');
  await runInTransaction(deps.db, async (tx) => {
    const user = await findVisibleUser(deps, tx, ctx, input.userId);
    validateNewPassword(input.temporaryPassword, user.username);
    const now = ctx.clock.now();
    await deps.repo.updatePassword(tx, user.id, {
      passwordHash: await deps.hasher.hash(input.temporaryPassword),
      mustChangePassword: true,
      changedAt: now,
    });
    await deps.repo.clearPinFailures(tx, user.id);
    await deps.revokeUserSessions(tx, user.id, 'SENHA_REDEFINIDA', now);
    await recordAuditFromContext(tx, ctx, 'USER_UPDATED', {
      entityType: 'app_user',
      entityId: user.id,
      after: { temporaryPasswordSet: true },
    });
  });
}

export async function disableUser(
  deps: UsersDependencies,
  ctx: RequestContext,
  input: { userId: Id },
): Promise<void> {
  requirePermission(ctx, 'users.disable');
  if (input.userId === ctx.userId) {
    throw new DomainError(
      'CANNOT_DISABLE_SELF',
      'Você não pode desativar o seu próprio usuário.',
      'BUSINESS_RULE',
    );
  }
  await runInTransaction(deps.db, async (tx) => {
    const user = await findVisibleUser(deps, tx, ctx, input.userId);
    if (user.status === 'DESATIVADO') return;
    const now = ctx.clock.now();
    await deps.repo.disable(tx, user.id, now);
    await deps.revokeUserSessions(tx, user.id, 'USUARIO_DESATIVADO', now);
    await recordAuditFromContext(tx, ctx, 'USER_DISABLED', {
      entityType: 'app_user',
      entityId: user.id,
      before: { status: user.status },
      after: { status: 'DESATIVADO' },
    });
  });
}
