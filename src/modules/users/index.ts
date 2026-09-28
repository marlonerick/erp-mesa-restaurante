// API pública do módulo Users.
import { getDatabase } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Id, RequestContext } from '@/shared/kernel';
import { argon2Hasher } from '@/shared/security/password-hasher';
import * as admin from './application/administration';
import type { RevokeUserSessions, UserRecord, UsersDependencies } from './application/ports';
import { userRepository as repo } from './infrastructure/user-repository';

export { validateNewPassword } from './domain/password-policy';
export { normalizeUsername } from './domain/username';
export type { UserSummary } from './application/administration';
export type { RevokeUserSessions, UserRecord, UserStatus } from './application/ports';

// ---- Consultas e alterações de credenciais (usadas pelo módulo Auth) ----

export const findUserByUsername = (tx: Transaction, username: string) =>
  repo.findByUsername(tx, username);
export const findUserById = (tx: Transaction, id: Id) => repo.findById(tx, id);
export const findUsersByIds = (tx: Transaction, ids: readonly Id[]): Promise<UserRecord[]> =>
  repo.findManyByIds(tx, ids);
export const countUsers = (tx: Transaction) => repo.countAll(tx);
export const recordPinFailure = (tx: Transaction, id: Id, now: Date, maxAttempts: number) =>
  repo.registerPinFailure(tx, id, { now, maxAttempts });
export const clearPinFailures = (tx: Transaction, id: Id) => repo.clearPinFailures(tx, id);
export const storePasswordHash = (
  tx: Transaction,
  id: Id,
  input: { passwordHash: string; mustChangePassword: boolean; changedAt: Date },
) => repo.updatePassword(tx, id, input);
export const storePinHash = (tx: Transaction, id: Id, pinHash: string) =>
  repo.updatePin(tx, id, pinHash);
export const insertUser = (tx: Transaction, user: Parameters<typeof repo.insert>[1]) =>
  repo.insert(tx, user);

// ---- Administração de usuários (telas de gerente/admin) ----

/**
 * Casos de uso de administração. `revokeUserSessions` vem do módulo Auth (injetado por quem
 * monta a tela), o que evita dependência circular Users ↔ Auth.
 */
export function userAdministration(
  overrides: Partial<UsersDependencies> & { revokeUserSessions: RevokeUserSessions },
) {
  const deps: UsersDependencies = {
    db: overrides.db ?? getDatabase().db,
    repo,
    hasher: overrides.hasher ?? argon2Hasher,
    revokeUserSessions: overrides.revokeUserSessions,
  };
  return {
    list: (ctx: RequestContext) => admin.listUsers(deps, ctx),
    create: (ctx: RequestContext, input: Parameters<typeof admin.createUser>[2]) =>
      admin.createUser(deps, ctx, input),
    rename: (ctx: RequestContext, input: Parameters<typeof admin.renameUser>[2]) =>
      admin.renameUser(deps, ctx, input),
    setRoles: (ctx: RequestContext, input: Parameters<typeof admin.setUserRoles>[2]) =>
      admin.setUserRoles(deps, ctx, input),
    resetPassword: (ctx: RequestContext, input: Parameters<typeof admin.resetUserPassword>[2]) =>
      admin.resetUserPassword(deps, ctx, input),
    disable: (ctx: RequestContext, input: Parameters<typeof admin.disableUser>[2]) =>
      admin.disableUser(deps, ctx, input),
  };
}

export type UserAdministration = ReturnType<typeof userAdministration>;
