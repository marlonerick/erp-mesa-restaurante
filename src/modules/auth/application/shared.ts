import { recordAudit } from '@/modules/audit';
import type { StoreInfo } from '@/modules/organizations';
import { clearPinFailures, recordPinFailure, type UserRecord } from '@/modules/users';
import type { Transaction } from '@/shared/db/transaction';
import { DomainError, type Id, newId } from '@/shared/kernel';
import { generateSecretToken, hashToken } from '@/shared/security/tokens';
import { PIN_MAX_ATTEMPTS } from '../domain/pin-policy';
import { idleTimeoutFor, sessionExpiresAt } from '../domain/session-policy';
import type { AuthDependencies, DeviceRecord, LoginMethod, RequestMeta } from './ports';

// Erros públicos do módulo (docs/modules/auth.md §7). Mensagens exibidas ao usuário.
export const authErrors = {
  invalidCredentials: () =>
    new DomainError('INVALID_CREDENTIALS', 'Usuário ou senha inválidos.', 'UNAUTHENTICATED'),
  rateLimited: () =>
    new DomainError(
      'RATE_LIMITED',
      'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
      'RATE_LIMITED',
    ),
  noStoreAccess: () =>
    new DomainError(
      'NO_STORE_ACCESS',
      'Seu usuário não tem acesso a nenhuma loja. Fale com o gerente.',
      'FORBIDDEN',
    ),
  invalidPin: () => new DomainError('INVALID_PIN', 'PIN incorreto.', 'UNAUTHENTICATED'),
  pinLocked: () =>
    new DomainError(
      'PIN_LOCKED',
      'PIN bloqueado após 5 tentativas. Entre com sua senha.',
      'FORBIDDEN',
    ),
  pinNotSet: () =>
    new DomainError('PIN_NOT_SET', 'Este usuário ainda não cadastrou um PIN.', 'BUSINESS_RULE'),
  deviceUserNotAllowed: () =>
    new DomainError(
      'DEVICE_USER_NOT_ALLOWED',
      'Entre com sua senha neste aparelho primeiro.',
      'FORBIDDEN',
    ),
  currentPasswordInvalid: () =>
    new DomainError('CURRENT_PASSWORD_INVALID', 'A senha atual está incorreta.', 'VALIDATION'),
};

export type PinCheck = 'OK' | 'INVALID' | 'LOCKED' | 'NOT_SET';

/**
 * Confere o PIN. Erro soma uma falha (e trava no 5º erro — RN-AUTH-12); acerto zera o contador.
 * Quem chama deve CONFIRMAR a transação antes de devolver o erro, para a falha ficar gravada.
 */
export async function checkPin(
  deps: AuthDependencies,
  tx: Transaction,
  user: UserRecord,
  pin: string,
  now: Date,
): Promise<PinCheck> {
  if (user.pinLockedAt !== null) return 'LOCKED';
  if (user.pinHash === null) return 'NOT_SET';
  if (await deps.hasher.verify(user.pinHash, pin)) {
    if (user.failedPinAttempts > 0) await clearPinFailures(tx, user.id);
    return 'OK';
  }
  const { locked } = await recordPinFailure(tx, user.id, now, PIN_MAX_ATTEMPTS);
  return locked ? 'LOCKED' : 'INVALID';
}

export function pinError(result: Exclude<PinCheck, 'OK'>): DomainError {
  switch (result) {
    case 'INVALID':
      return authErrors.invalidPin();
    case 'LOCKED':
      return authErrors.pinLocked();
    case 'NOT_SET':
      return authErrors.pinNotSet();
  }
}

/** Cria a sessão e devolve o token que vai no cookie (só o hash fica no banco). */
export async function openSession(
  deps: AuthDependencies,
  tx: Transaction,
  input: {
    user: UserRecord;
    store: StoreInfo;
    device: DeviceRecord;
    /** Aparelho criado agora: não há sessão dele para encerrar. */
    deviceIsNew?: boolean;
    method: LoginMethod;
    meta: RequestMeta;
    now: Date;
  },
): Promise<{ token: string; sessionId: Id }> {
  const { user, store, device, method, meta, now } = input;
  // Um aparelho, uma sessão ativa: quem estava usando sai (RN-AUTH-11). Em aparelho novo o UPDATE
  // seria inútil e "trancaria" o fim do índice (gap lock), causando deadlock entre logins
  // simultâneos — os ids UUIDv7 são crescentes e todos disputariam o mesmo trecho.
  if (!input.deviceIsNew) {
    await deps.repo.revokeDeviceSessions(tx, device.id, 'TROCA_USUARIO', now);
  }

  const token = generateSecretToken();
  const sessionId = newId();
  await deps.repo.insertSession(tx, {
    id: sessionId,
    tokenHash: hashToken(token),
    userId: user.id,
    organizationId: user.organizationId,
    activeStoreId: store.id,
    deviceId: device.id,
    loginMethod: method,
    idleTimeoutSeconds: idleTimeoutFor(device.shared),
    ip: meta.ip,
    userAgent: meta.userAgent,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: sessionExpiresAt(now),
  });
  await recordAudit(tx, {
    event: 'LOGIN',
    occurredAt: now,
    organizationId: user.organizationId,
    storeId: store.id,
    actorUserId: user.id,
    entityType: 'user_session',
    entityId: sessionId,
    after: { method, sharedDevice: device.shared },
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });
  return { token, sessionId };
}

export async function recordLoginFailure(
  tx: Transaction,
  input: {
    user: UserRecord | null;
    attemptedUsername: string;
    reason: string;
    method: LoginMethod;
    meta: RequestMeta;
    now: Date;
  },
): Promise<void> {
  await recordAudit(tx, {
    event: 'LOGIN_FAILED',
    occurredAt: input.now,
    organizationId: input.user?.organizationId ?? null,
    storeId: null,
    actorUserId: input.user?.id ?? null,
    entityType: 'app_user',
    entityId: input.user?.id ?? input.attemptedUsername.slice(0, 64),
    after: {
      reason: input.reason,
      method: input.method,
      username: input.attemptedUsername.slice(0, 50),
    },
    ip: input.meta.ip,
    userAgent: input.meta.userAgent,
    requestId: input.meta.requestId,
  });
}
