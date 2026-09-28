import type { Clock } from './clock';
import { DomainError } from './errors';
import type { Id } from './id';
import type { Permission } from './permissions';

/**
 * Quem está fazendo a requisição, em qual loja e com quais permissões. Montado no servidor a
 * partir da SESSÃO — nunca a partir de dados enviados pelo navegador (ADR-0009).
 */
export interface RequestContext {
  readonly requestId: string;
  readonly sessionId: Id;
  readonly userId: Id;
  readonly organizationId: Id;
  /** Loja ativa da sessão; todo acesso a dados operacionais filtra por ela. */
  readonly storeId: Id;
  readonly permissions: ReadonlySet<Permission>;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly clock: Clock;
}

export function hasPermission(ctx: RequestContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

/** Verificação obrigatória no início de todo caso de uso (RN-AUTHZ-03). */
export function requirePermission(ctx: RequestContext, permission: Permission): void {
  if (!hasPermission(ctx, permission)) {
    throw new DomainError('FORBIDDEN', 'Você não tem permissão para esta ação.', 'FORBIDDEN', {
      permission,
    });
  }
}
