import type { Transaction } from '@/shared/db/transaction';
import { auditLog } from '@/shared/db/schema';
import { type Id, newId } from '@/shared/kernel';
import { type AuditEvent, stripSecrets } from '../domain/audit-event';

export interface AuditEntry {
  readonly event: AuditEvent;
  readonly occurredAt: Date;
  readonly organizationId: Id | null;
  readonly storeId: Id | null;
  readonly actorUserId: Id | null;
  readonly authorizerUserId?: Id | null;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly before?: Record<string, unknown>;
  readonly after?: Record<string, unknown>;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly requestId: string | null;
}

/** Grava na MESMA transação da operação (RN-AUDIT-04). Somente inclusão (RN-AUDIT-02). */
export async function insertAuditEntry(tx: Transaction, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    id: newId(),
    event: entry.event,
    occurredAt: entry.occurredAt,
    organizationId: entry.organizationId,
    storeId: entry.storeId,
    actorUserId: entry.actorUserId,
    authorizerUserId: entry.authorizerUserId ?? null,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    beforeData: entry.before ? stripSecrets(entry.before) : null,
    afterData: entry.after ? stripSecrets(entry.after) : null,
    ip: entry.ip,
    userAgent: entry.userAgent?.slice(0, 255) ?? null,
    requestId: entry.requestId,
  });
}
