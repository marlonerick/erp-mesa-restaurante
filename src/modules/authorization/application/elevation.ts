import type { Transaction } from '@/shared/db/transaction';
import { DomainError, type Id, type Permission, type RequestContext } from '@/shared/kernel';
import { hashToken } from '@/shared/security/tokens';
import type { AuthorizationRepository } from './ports';

/** Validade da autorização do gerente (RN-AUTHZ-06). */
export const ELEVATED_GRANT_TTL_SECONDS = 60;

export interface AuthorizationOutcome {
  /** Preenchido quando a ação foi liberada por autorização elevada; vai para a auditoria. */
  readonly authorizerUserId: Id | null;
}

/**
 * Libera a ação se o usuário tem a permissão; senão, consome uma autorização elevada válida.
 * Usar DENTRO da transação da ação sensível: se a ação falhar, o consumo é desfeito junto.
 */
export async function authorizeOrElevate(
  repo: AuthorizationRepository,
  tx: Transaction,
  ctx: RequestContext,
  permission: Permission,
  grantToken: string | null,
): Promise<AuthorizationOutcome> {
  if (ctx.permissions.has(permission)) {
    return { authorizerUserId: null };
  }
  if (grantToken === null) {
    throw new DomainError('FORBIDDEN', 'Você não tem permissão para esta ação.', 'FORBIDDEN', {
      permission,
      elevationAllowed: true,
    });
  }
  const authorizerUserId = await repo.consumeElevatedGrant(tx, {
    tokenHash: hashToken(grantToken),
    sessionId: ctx.sessionId,
    storeId: ctx.storeId,
    permission,
    now: ctx.clock.now(),
  });
  if (authorizerUserId === null) {
    throw new DomainError(
      'ELEVATED_GRANT_INVALID',
      'A autorização expirou ou já foi usada. Peça novamente.',
      'FORBIDDEN',
    );
  }
  return { authorizerUserId };
}
