import { recordAuditFromContext } from '@/modules/audit';
import {
  ELEVATED_GRANT_TTL_SECONDS,
  getPermissionsInStore,
  saveElevatedGrant,
} from '@/modules/authorization';
import {
  findUserById,
  findUserByUsername,
  normalizeUsername,
  storePasswordHash,
  storePinHash,
  type UserRecord,
  validateNewPassword,
} from '@/modules/users';
import { runInTransaction } from '@/shared/db/transaction';
import { DomainError, isDomainError, type Permission, type RequestContext } from '@/shared/kernel';
import { dummyPasswordHash } from '@/shared/security/password-hasher';
import { generateSecretToken, hashToken } from '@/shared/security/tokens';
import { validatePin } from '../domain/pin-policy';
import {
  LOGIN_FAILURES_PER_USER,
  LOGIN_WINDOW_SECONDS,
  rateLimitWindowStart,
} from '../domain/rate-limit-policy';
import type { AuthDependencies } from './ports';
import { authErrors, recordLoginFailure, reserveAttempt, verifyPin } from './shared';

const unauthenticated = () =>
  new DomainError('UNAUTHENTICATED', 'Sua sessão terminou. Entre novamente.', 'UNAUTHENTICATED');

const currentPasswordKey = (userId: string) => `current-password:user:${userId}`;

/**
 * Confere a senha ATUAL de quem está logado com limite de tentativas (achado I4 da revisão):
 * sem isso, quem pegasse uma sessão aberta poderia adivinhar a senha sem limite.
 * Reserva a tentativa → Argon2 fora do banco → zera o contador se acertou.
 */
async function verifyCurrentPassword(
  deps: AuthDependencies,
  ctx: RequestContext,
  password: string,
): Promise<UserRecord> {
  const window = rateLimitWindowStart(ctx.clock.now(), LOGIN_WINDOW_SECONDS);
  const key = currentPasswordKey(ctx.userId);
  const reserved = await runInTransaction(deps.db, async (tx) => ({
    allowed: await reserveAttempt(deps, tx, key, LOGIN_FAILURES_PER_USER, window),
    user: await findUserById(tx, ctx.userId),
  }));
  if (!reserved.user) throw unauthenticated();
  if (!reserved.allowed) throw authErrors.rateLimited();
  if (!(await deps.hasher.verify(reserved.user.passwordHash, password))) {
    throw authErrors.currentPasswordInvalid();
  }
  await runInTransaction(deps.db, (tx) => deps.repo.rateLimitClear(tx, key, window));
  return reserved.user;
}

/**
 * Trocar a própria senha (inclusive a provisória — RN-AUTH-09). Encerra as OUTRAS sessões do
 * usuário, mantendo a atual.
 */
export async function changeOwnPassword(
  deps: AuthDependencies,
  ctx: RequestContext,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const user = await verifyCurrentPassword(deps, ctx, input.currentPassword);
  validateNewPassword(input.newPassword, user.username);
  if (input.newPassword === input.currentPassword) {
    throw new DomainError(
      'WEAK_PASSWORD',
      'A nova senha deve ser diferente da atual.',
      'VALIDATION',
    );
  }
  const passwordHash = await deps.hasher.hash(input.newPassword);
  await runInTransaction(deps.db, async (tx) => {
    const now = ctx.clock.now();
    await storePasswordHash(tx, user.id, {
      passwordHash,
      mustChangePassword: false,
      changedAt: now,
    });
    await deps.repo.revokeUserSessions(tx, user.id, 'SENHA_ALTERADA', now, ctx.sessionId);
    await recordAuditFromContext(tx, ctx, 'USER_UPDATED', {
      entityType: 'app_user',
      entityId: user.id,
      after: { change: 'OWN_PASSWORD' },
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
  const user = await verifyCurrentPassword(deps, ctx, input.currentPassword);
  const pinHash = await deps.hasher.hash(input.pin);
  await runInTransaction(deps.db, async (tx) => {
    await storePinHash(tx, user.id, pinHash);
    await recordAuditFromContext(tx, ctx, 'USER_UPDATED', {
      entityType: 'app_user',
      entityId: user.id,
      after: { change: 'OWN_PIN' },
    });
  });
}

const invalidAuthorization = () =>
  new DomainError(
    'INVALID_AUTHORIZATION',
    'Usuário ou PIN do autorizador inválidos.',
    'UNAUTHENTICATED',
  );

const authorizerNotAllowed = () =>
  new DomainError(
    'AUTHORIZER_NOT_ALLOWED',
    'Este usuário não pode autorizar esta ação.',
    'FORBIDDEN',
  );

/**
 * Autorização do gerente no aparelho de outra pessoa (RN-AUTHZ-06/07).
 * - Usuário inexistente, de outra organização ou PIN errado: MESMA resposta e mesma demora
 *   (não revela quem existe — sugestão 1 da revisão). Falhas vão para a auditoria.
 * - Só com o PIN correto se descobre se a pessoa tem a permissão.
 */
export async function requestElevation(
  deps: AuthDependencies,
  ctx: RequestContext,
  input: { authorizerUsername: string; pin: string; permission: Permission },
): Promise<{ grantToken: string; expiresAt: Date }> {
  const now = ctx.clock.now();
  let username: string | null;
  try {
    username = normalizeUsername(input.authorizerUsername);
  } catch (error) {
    if (!isDomainError(error)) throw error;
    username = null;
  }

  const found = await runInTransaction(deps.db, async (tx) => {
    const user = username ? await findUserByUsername(tx, username) : null;
    return user?.status === 'ATIVO' && user.organizationId === ctx.organizationId ? user : null;
  });

  if (!found) {
    await deps.hasher.verify(await dummyPasswordHash(deps.hasher), input.pin);
    throw invalidAuthorization();
  }

  const pin = await verifyPin(deps, found, input.pin, now);
  if (pin !== 'OK') {
    // Travado ou sem PIN respondem sem rodar o Argon2: roda o hash falso para a demora ser igual
    if (pin === 'LOCKED' || pin === 'NOT_SET') {
      await deps.hasher.verify(await dummyPasswordHash(deps.hasher), input.pin);
    }
    await runInTransaction(deps.db, (tx) =>
      recordLoginFailure(tx, {
        user: found,
        attemptedUsername: found.username,
        reason: `AUTORIZACAO_PIN_${pin}`,
        method: 'PIN',
        meta: { ip: ctx.ip, userAgent: ctx.userAgent, requestId: ctx.requestId },
        now,
      }),
    );
    // Resposta única para qualquer falha: não revela se a pessoa existe, se tem PIN ou se travou
    throw invalidAuthorization();
  }

  return runInTransaction(deps.db, async (tx) => {
    const authorizer = await findUserById(tx, found.id);
    // Senha provisória: a pessoa ainda não "assumiu" o acesso — não autoriza nada (RN-AUTH-09)
    if (authorizer?.status !== 'ATIVO' || authorizer.mustChangePassword) {
      throw authorizerNotAllowed();
    }
    const permissions = await getPermissionsInStore(tx, authorizer.id, ctx.storeId);
    if (!permissions.has(input.permission)) throw authorizerNotAllowed();

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
    return { grantToken, expiresAt };
  });
}
