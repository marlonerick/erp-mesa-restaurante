// API pública do módulo Auth.
import type { RevokeUserSessions } from '@/modules/users';
import { getDatabase } from '@/shared/db/client';
import { systemClock } from '@/shared/kernel';
import type { Id, Permission, RequestContext } from '@/shared/kernel';
import { argon2Hasher } from '@/shared/security/password-hasher';
import * as credentials from './application/credentials';
import { type LoginInput, login } from './application/login';
import { purgeExpiredAuthData } from './application/maintenance';
import type { AuthDependencies, RequestMeta } from './application/ports';
import {
  authenticate,
  endSession,
  listSessionStores,
  revokeAllUserSessions,
  switchStore,
} from './application/session';
import { listDeviceUsers, switchUser } from './application/switch-user';
import { authRepository } from './infrastructure/auth-repository';

export type { AuthenticatedSession } from './application/session';
export type { DeviceUser } from './application/switch-user';
export type { LoginInput, LoginResult } from './application/login';
export type { RequestMeta } from './application/ports';
export { validatePin } from './domain/pin-policy';
export {
  ABSOLUTE_LIFETIME_SECONDS,
  SHARED_DEVICE_IDLE_TIMEOUT_SECONDS,
} from './domain/session-policy';

/** Casos de uso de autenticação com as dependências reais (substituíveis em testes). */
export function authService(overrides: Partial<AuthDependencies> = {}) {
  const deps: AuthDependencies = {
    db: overrides.db ?? getDatabase().db,
    repo: authRepository,
    hasher: overrides.hasher ?? argon2Hasher,
    clock: overrides.clock ?? systemClock,
  };
  const revokeUserSessions: RevokeUserSessions = (tx, userId, reason, now) =>
    revokeAllUserSessions(deps, tx, userId, reason, now);

  return {
    login: (input: LoginInput, meta: RequestMeta) => login(deps, input, meta),
    listDeviceUsers: (deviceToken: string | null) => listDeviceUsers(deps, deviceToken),
    switchUser: (input: Parameters<typeof switchUser>[1], meta: RequestMeta) =>
      switchUser(deps, input, meta),
    authenticate: (token: string | null, meta: RequestMeta, options?: { touch: boolean }) =>
      authenticate(deps, token, meta, options),
    logout: (token: string | null, meta: RequestMeta) => endSession(deps, token, meta, 'LOGOUT'),
    lockScreen: (token: string | null, meta: RequestMeta) =>
      endSession(deps, token, meta, 'BLOQUEIO'),
    changeOwnPassword: (
      ctx: RequestContext,
      input: { currentPassword: string; newPassword: string },
    ) => credentials.changeOwnPassword(deps, ctx, input),
    setOwnPin: (ctx: RequestContext, input: { currentPassword: string; pin: string }) =>
      credentials.setOwnPin(deps, ctx, input),
    requestElevation: (
      ctx: RequestContext,
      input: { authorizerUsername: string; pin: string; permission: Permission },
    ) => credentials.requestElevation(deps, ctx, input),
    /** Lojas do seletor do menu e troca de loja em 1 clique (RN-ORG-12). */
    listSessionStores: (ctx: RequestContext) => listSessionStores(deps, ctx),
    switchStore: (ctx: RequestContext, storeId: Id) => switchStore(deps, ctx, storeId),
    purgeExpiredData: () => purgeExpiredAuthData(deps),
    /** Injetado na administração de usuários (desativar, redefinir senha). */
    revokeUserSessions,
  };
}

export type AuthService = ReturnType<typeof authService>;
