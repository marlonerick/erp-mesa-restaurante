import { recordAudit, recordAuditFromContext } from '@/modules/audit';
import { getAccessibleStores, getPermissionsInStore } from '@/modules/authorization';
import { findTerminalOfDevice, type StoreInfo } from '@/modules/organizations';
import { findUserById, type UserRecord } from '@/modules/users';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import { DomainError, type Id, type RequestContext } from '@/shared/kernel';
import { hashToken } from '@/shared/security/tokens';
import {
  SHARED_DEVICE_IDLE_TIMEOUT_SECONDS,
  sessionStatus,
  shouldTouchSession,
} from '../domain/session-policy';
import type { AuthDependencies, RequestMeta, RevokeReason, SessionRecord } from './ports';

/** Tudo o que a tela e os casos de uso precisam saber sobre quem está logado. */
export interface AuthenticatedSession {
  readonly context: RequestContext;
  readonly userName: string;
  readonly username: string;
  readonly storeName: string;
  /** Terminal da loja vinculado a este aparelho (RN-ORG-11), se houver. */
  readonly terminalName: string | null;
  readonly mustChangePassword: boolean;
  readonly sharedDevice: boolean;
}

/**
 * Loja em que a sessão vai trabalhar (RN-ORG-07). A loja ativa precisa estar ATIVA e a pessoa
 * precisa ter perfil nela; senão a sessão passa para a primeira loja acessível (ordem alfabética),
 * com auditoria. Sem nenhuma, a sessão é ENCERRADA no banco — reativar a loja depois não
 * ressuscita um cookie antigo (achado I-4).
 */
async function resolveSessionStore(
  deps: AuthDependencies,
  tx: Transaction,
  session: SessionRecord,
  user: UserRecord,
  meta: RequestMeta,
  now: Date,
): Promise<StoreInfo | null> {
  const stores = await getAccessibleStores(tx, user.id, user.organizationId);
  const current = stores.find((store) => store.id === session.activeStoreId);
  if (current) return current;

  const [fallback] = stores;
  if (!fallback) {
    await deps.repo.revokeSession(tx, session.id, 'SEM_LOJA', now);
    return null;
  }
  // UPDATE condicional: duas requisições simultâneas (layout + página) movem a sessão uma vez só;
  // só quem moveu de fato registra a auditoria (achado R-1 da reverificação)
  const moved = await deps.repo.setSessionStore(tx, session.id, {
    from: session.activeStoreId,
    to: fallback.id,
  });
  if (!moved) return fallback;
  await recordAudit(tx, {
    event: 'STORE_SWITCHED',
    occurredAt: now,
    organizationId: user.organizationId,
    storeId: fallback.id,
    actorUserId: user.id,
    entityType: 'user_session',
    entityId: session.id,
    before: { storeId: session.activeStoreId },
    after: { storeId: fallback.id, reason: 'LOJA_INDISPONIVEL' },
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });
  return fallback;
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
    if (user?.status !== 'ATIVO') return null;
    const store = await resolveSessionStore(deps, tx, session, user, meta, now);
    if (!store) return null;

    if (options.touch && shouldTouchSession(session, now)) {
      await deps.repo.touchSession(tx, session.id, now);
    }
    const permissions = user.mustChangePassword
      ? new Set<never>() // senha provisória: nada liberado até trocar (RN-AUTH-09)
      : await getPermissionsInStore(tx, user.id, store.id);
    const terminal =
      session.deviceId === null ? null : await findTerminalOfDevice(tx, store.id, session.deviceId);

    return {
      context: {
        requestId: meta.requestId,
        sessionId: session.id,
        userId: user.id,
        organizationId: user.organizationId,
        storeId: store.id,
        deviceId: session.deviceId,
        terminalId: terminal?.id ?? null,
        permissions,
        ip: meta.ip,
        userAgent: meta.userAgent,
        clock: deps.clock,
      },
      userName: user.name,
      username: user.username,
      storeName: store.name,
      terminalName: terminal?.name ?? null,
      mustChangePassword: user.mustChangePassword,
      sharedDevice: session.idleTimeoutSeconds === SHARED_DEVICE_IDLE_TIMEOUT_SECONDS,
    };
  });
}

/** Lojas ativas em que a pessoa tem perfil — o seletor de lojas do menu (RN-ORG-12). */
export async function listSessionStores(
  deps: AuthDependencies,
  ctx: RequestContext,
): Promise<{ id: Id; name: string }[]> {
  return runInTransaction(deps.db, async (tx) =>
    (await getAccessibleStores(tx, ctx.userId, ctx.organizationId)).map((store) => ({
      id: store.id,
      name: store.name,
    })),
  );
}

/**
 * Troca de loja em 1 clique (RN-ORG-12): só para loja ativa com algum perfil. A resposta para loja
 * inexistente, de outra organização ou sem perfil é a mesma ("não encontrada").
 */
export async function switchStore(
  deps: AuthDependencies,
  ctx: RequestContext,
  storeId: Id,
): Promise<void> {
  await runInTransaction(deps.db, async (tx) => {
    const stores = await getAccessibleStores(tx, ctx.userId, ctx.organizationId);
    if (!stores.some((store) => store.id === storeId)) {
      throw new DomainError('STORE_NOT_FOUND', 'Loja não encontrada.', 'NOT_FOUND');
    }
    if (storeId === ctx.storeId) return;
    const moved = await deps.repo.setSessionStore(tx, ctx.sessionId, {
      from: ctx.storeId,
      to: storeId,
    });
    if (!moved) return; // a sessão já tinha mudado (outra aba): nada a registrar
    await recordAuditFromContext(tx, ctx, 'STORE_SWITCHED', {
      entityType: 'user_session',
      entityId: ctx.sessionId,
      before: { storeId: ctx.storeId },
      after: { storeId },
    });
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
