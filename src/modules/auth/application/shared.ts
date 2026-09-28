import { recordAudit } from '@/modules/audit';
import type { StoreInfo } from '@/modules/organizations';
import {
  clearPinFailures,
  lockPinIfExhausted,
  reservePinAttempt,
  type UserRecord,
} from '@/modules/users';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
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
 * Confere o PIN com "reserva antes de conferir" (RN-AUTH-12, achado I1 da revisão):
 * 1) transação curta soma a tentativa (ou trava, se já houve 5); 2) Argon2 FORA do banco;
 * 3) acerto zera o contador. Tentativas simultâneas: no máximo 5 conferências.
 */
export async function verifyPin(
  deps: AuthDependencies,
  user: UserRecord,
  pin: string,
  now: Date,
): Promise<PinCheck> {
  if (user.pinHash === null) return 'NOT_SET';
  const { reserved } = await runInTransaction(deps.db, (tx) =>
    reservePinAttempt(tx, user.id, now, PIN_MAX_ATTEMPTS),
  );
  if (!reserved) return 'LOCKED';
  if (!(await deps.hasher.verify(user.pinHash, pin))) {
    // O 5º erro já trava (e a tela "Quem está usando?" passa a mostrar o bloqueio)
    const locked = await runInTransaction(deps.db, (tx) =>
      lockPinIfExhausted(tx, user.id, now, PIN_MAX_ATTEMPTS),
    );
    return locked ? 'LOCKED' : 'INVALID';
  }
  await runInTransaction(deps.db, (tx) => clearPinFailures(tx, user.id));
  return 'OK';
}

/**
 * Reserva uma tentativa no contador `key` da janela atual e diz se ainda está dentro do limite.
 * Usado antes de conferir senhas (login, senha atual) — achados B2 e I4 da revisão.
 */
export async function reserveAttempt(
  deps: AuthDependencies,
  tx: Transaction,
  key: string,
  limit: number,
  windowStart: Date,
): Promise<boolean> {
  return (await deps.repo.rateLimitReserve(tx, key, windowStart)) <= limit;
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
    /**
     * Só um nome JÁ VALIDADO pelo formato de usuário, ou null. Texto livre pode ser uma senha
     * digitada no campo errado — e a auditoria é para sempre (sugestão 7 da revisão).
     */
    attemptedUsername: string | null;
    reason: string;
    method: LoginMethod;
    meta: RequestMeta;
    now: Date;
  },
): Promise<void> {
  const username = input.attemptedUsername ?? '(formato inválido)';
  await recordAudit(tx, {
    event: 'LOGIN_FAILED',
    occurredAt: input.now,
    organizationId: input.user?.organizationId ?? null,
    storeId: null,
    actorUserId: input.user?.id ?? null,
    entityType: 'app_user',
    entityId: input.user?.id ?? username,
    after: { reason: input.reason, method: input.method, username },
    ip: input.meta.ip,
    userAgent: input.meta.userAgent,
    requestId: input.meta.requestId,
  });
}
