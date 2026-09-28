import { recordAuditFromContext } from '@/modules/audit';
import {
  saveElevatedGrant,
  ELEVATED_GRANT_TTL_SECONDS,
  getPermissionsInStore,
} from '@/modules/authorization';
import {
  findUserById,
  findUserByUsername,
  normalizeUsername,
  storePasswordHash,
  storePinHash,
  validateNewPassword,
} from '@/modules/users';
import { runInTransaction } from '@/shared/db/transaction';
import { DomainError, isDomainError, type Permission, type RequestContext } from '@/shared/kernel';
import { generateSecretToken, hashToken } from '@/shared/security/tokens';
import { validatePin } from '../domain/pin-policy';
import type { AuthDependencies } from './ports';
import { authErrors, checkPin, pinError } from './shared';

const unauthenticated = () =>
  new DomainError('UNAUTHENTICATED', 'Sua sessão terminou. Entre novamente.', 'UNAUTHENTICATED');

/**
 * Trocar a própria senha (inclusive a provisória — RN-AUTH-09). Encerra as OUTRAS sessões do
 * usuário, mantendo a atual.
 */
export async function changeOwnPassword(
  deps: AuthDependencies,
  ctx: RequestContext,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  await runInTransaction(deps.db, async (tx) => {
    const user = await findUserById(tx, ctx.userId);
    if (!user) throw unauthenticated();
    if (!(await deps.hasher.verify(user.passwordHash, input.currentPassword))) {
      throw authErrors.currentPasswordInvalid();
    }
    validateNewPassword(input.newPassword, user.username);
    if (input.newPassword === input.currentPassword) {
      throw new DomainError(
        'WEAK_PASSWORD',
        'A nova senha deve ser diferente da atual.',
        'VALIDATION',
      );
    }
    const now = ctx.clock.now();
    await storePasswordHash(tx, user.id, {
      passwordHash: await deps.hasher.hash(input.newPassword),
      mustChangePassword: false,
      changedAt: now,
    });
    await deps.repo.revokeUserSessions(tx, user.id, 'SENHA_ALTERADA', now, ctx.sessionId);
    await recordAuditFromContext(tx, ctx, 'USER_UPDATED', {
      entityType: 'app_user',
      entityId: user.id,
      after: { ownPasswordChanged: true },
    });
  });
}

/** Cadastrar ou trocar o próprio PIN; exige a senha atual (RN-AUTH-10). */
export async function setOwnPin(
  deps: AuthDependencies,
  ctx: RequestContext,
  input: { currentPassword: string; pin: string },
): Promise<void> {
  validatePin(input.pin);
  await runInTransaction(deps.db, async (tx) => {
    const user = await findUserById(tx, ctx.userId);
    if (!user) throw unauthenticated();
    if (!(await deps.hasher.verify(user.passwordHash, input.currentPassword))) {
      throw authErrors.currentPasswordInvalid();
    }
    await storePinHash(tx, user.id, await deps.hasher.hash(input.pin));
    await recordAuditFromContext(tx, ctx, 'USER_UPDATED', {
      entityType: 'app_user',
      entityId: user.id,
      after: { ownPinChanged: true },
    });
  });
}

const authorizerNotAllowed = () =>
  new DomainError(
    'AUTHORIZER_NOT_ALLOWED',
    'Este usuário não pode autorizar esta ação.',
    'FORBIDDEN',
  );

type ElevationOutcome =
  { ok: true; grantToken: string; expiresAt: Date } | { ok: false; error: DomainError };

/**
 * Autorização do gerente no aparelho de outra pessoa (RN-AUTHZ-06/07). Primeiro confere o PIN
 * (sem PIN correto nada é revelado), depois se o autorizador tem a permissão nesta loja.
 */
export async function requestElevation(
  deps: AuthDependencies,
  ctx: RequestContext,
  input: { authorizerUsername: string; pin: string; permission: Permission },
): Promise<{ grantToken: string; expiresAt: Date }> {
  const now = ctx.clock.now();
  let username: string;
  try {
    username = normalizeUsername(input.authorizerUsername);
  } catch (error) {
    if (isDomainError(error)) throw authorizerNotAllowed();
    throw error;
  }

  const outcome = await runInTransaction(deps.db, async (tx): Promise<ElevationOutcome> => {
    const authorizer = await findUserByUsername(tx, username);
    if (authorizer?.status !== 'ATIVO' || authorizer.organizationId !== ctx.organizationId) {
      return { ok: false, error: authorizerNotAllowed() };
    }
    const pin = await checkPin(deps, tx, authorizer, input.pin, now);
    if (pin !== 'OK') {
      return { ok: false, error: pinError(pin) };
    }
    const permissions = await getPermissionsInStore(tx, authorizer.id, ctx.storeId);
    if (!permissions.has(input.permission)) {
      return { ok: false, error: authorizerNotAllowed() };
    }

    const grantToken = generateSecretToken();
    const expiresAt = new Date(now.getTime() + ELEVATED_GRANT_TTL_SECONDS * 1000);
    await saveElevatedGrant(tx, {
      tokenHash: hashToken(grantToken),
      storeId: ctx.storeId,
      permission: input.permission,
      requesterUserId: ctx.userId,
      requesterSessionId: ctx.sessionId,
      authorizerUserId: authorizer.id,
      createdAt: now,
      expiresAt,
    });
    await recordAuditFromContext(tx, ctx, 'ELEVATED_AUTH_GRANTED', {
      authorizerUserId: authorizer.id,
      entityType: 'permission',
      entityId: input.permission,
      after: { permission: input.permission, expiresAt: expiresAt.toISOString() },
    });
    return { ok: true, grantToken, expiresAt };
  });

  if (!outcome.ok) throw outcome.error;
  return { grantToken: outcome.grantToken, expiresAt: outcome.expiresAt };
}
