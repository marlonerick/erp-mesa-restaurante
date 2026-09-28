import { recordAudit } from '@/modules/audit';
import { getPermissionsInStore } from '@/modules/authorization';
import { getStore } from '@/modules/organizations';
import { findUserById } from '@/modules/users';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import type { Id, RequestContext } from '@/shared/kernel';
import { hashToken } from '@/shared/security/tokens';
import {
  SHARED_DEVICE_IDLE_TIMEOUT_SECONDS,
  sessionStatus,
  shouldTouchSession,
} from '../domain/session-policy';
import type { AuthDependencies, RequestMeta, RevokeReason } from './ports';

/** Tudo o que a tela e os casos de uso precisam saber sobre quem está logado. */
export interface AuthenticatedSession {
  readonly context: RequestContext;
  readonly userName: string;
  readonly username: string;
  readonly storeName: string;
  readonly mustChangePassword: boolean;
  readonly sharedDevice: boolean;
}

/**
 * Valida o token do cookie e monta o contexto da requisição. `touch: false` para consultas
 * automáticas (polling), que não contam como uso (RN-AUTH-15). Sessão inválida: null.
 */
export async function authenticate(
  deps: AuthDependencies,
  sessionToken: string | null,
  meta: RequestMeta,
  options: { touch: boolean } = { touch: true },
): Promise<AuthenticatedSession | null> {
  if (!sessionToken) return null;
  const now = deps.clock.now();
  return runInTransaction(deps.db, async (tx) => {
    const session = await deps.repo.findSessionByTokenHash(tx, hashToken(sessionToken));
    if (!session || sessionStatus(session, now) !== 'ATIVA') return null;

    const user = await findUserById(tx, session.userId);
    const store = await getStore(tx, session.activeStoreId);
    if (user?.status !== 'ATIVO' || !store) return null;

    if (options.touch && shouldTouchSession(session, now)) {
      await deps.repo.touchSession(tx, session.id, now);
    }
    const permissions = user.mustChangePassword
      ? new Set<never>() // senha provisória: nada liberado até trocar (RN-AUTH-09)
      : await getPermissionsInStore(tx, user.id, store.id);

    return {
      context: {
        requestId: meta.requestId,
        sessionId: session.id,
        userId: user.id,
        organizationId: user.organizationId,
        storeId: store.id,
        permissions,
        ip: meta.ip,
        userAgent: meta.userAgent,
        clock: deps.clock,
      },
      userName: user.name,
      username: user.username,
      storeName: store.name,
      mustChangePassword: user.mustChangePassword,
      sharedDevice: session.idleTimeoutSeconds === SHARED_DEVICE_IDLE_TIMEOUT_SECONDS,
    };
  });
}

/** Sair (ou bloquear a tela do aparelho compartilhado). Token desconhecido: nada a fazer. */
export async function endSession(
  deps: AuthDependencies,
  sessionToken: string | null,
  meta: RequestMeta,
  reason: Extract<RevokeReason, 'LOGOUT' | 'BLOQUEIO'>,
): Promise<void> {
  if (!sessionToken) return;
  const now = deps.clock.now();
  await runInTransaction(deps.db, async (tx) => {
    const session = await deps.repo.findSessionByTokenHash(tx, hashToken(sessionToken));
    if (session?.revokedAt !== null) return;
    await deps.repo.revokeSession(tx, session.id, reason, now);
    await recordAudit(tx, {
      event: 'LOGOUT',
      occurredAt: now,
      organizationId: session.organizationId,
      storeId: session.activeStoreId,
      actorUserId: session.userId,
      entityType: 'user_session',
      entityId: session.id,
      after: { reason },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });
}

/** Encerra todas as sessões de um usuário (desativação, senha redefinida). Usado pelo módulo Users. */
export function revokeAllUserSessions(
  deps: AuthDependencies,
  tx: Transaction,
  userId: Id,
  reason: RevokeReason,
  now: Date,
): Promise<void> {
  return deps.repo.revokeUserSessions(tx, userId, reason, now);
}
