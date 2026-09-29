// API pública do módulo Audit.
import type { Transaction } from '@/shared/db/transaction';
import type { RequestContext } from '@/shared/kernel';
import type { AuditEvent } from './domain/audit-event';
import { type AuditEntry, insertAuditEntry } from './infrastructure/audit-repository';

export { AUDIT_EVENTS, type AuditEvent } from './domain/audit-event';
export type { AuditEntry } from './infrastructure/audit-repository';

export function recordAudit(tx: Transaction, entry: AuditEntry): Promise<void> {
  return insertAuditEntry(tx, entry);
}

type ContextFields = Omit<
  AuditEntry,
  | 'event'
  | 'occurredAt'
  | 'organizationId'
  | 'storeId'
  | 'actorUserId'
  | 'ip'
  | 'userAgent'
  | 'requestId'
> & {
  /**
   * Loja AFETADA pela ação, quando não é a loja da sessão (ex.: admin no Centro desativa a Praia —
   * a auditoria da Praia precisa mostrar). null = ação da organização (ex.: empresa).
   */
  readonly storeId?: AuditEntry['storeId'];
};

/** Registro de auditoria de uma ação feita por um usuário logado (quem, onde, de onde). */
export function recordAuditFromContext(
  tx: Transaction,
  ctx: RequestContext,
  event: AuditEvent,
  fields: ContextFields = {},
): Promise<void> {
  return insertAuditEntry(tx, {
    event,
    occurredAt: ctx.clock.now(),
    organizationId: ctx.organizationId,
    storeId: ctx.storeId,
    actorUserId: ctx.userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    ...fields,
  });
}
