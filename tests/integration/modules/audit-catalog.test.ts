import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { recordAudit } from '@/modules/audit';
import { mysqlErrno } from '@/shared/db/mysql-errors';
import { auditLog, permission, role, rolePermission } from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
import { newId, PERMISSIONS } from '@/shared/kernel';
import { useTestDatabase } from '../../support/database';
import { TEST_START } from '../../support/identity';

const { db } = useTestDatabase();

async function insertEntry(after: Record<string, unknown> = {}) {
  const entityId = newId();
  await runInTransaction(db, (tx) =>
    recordAudit(tx, {
      event: 'USER_UPDATED',
      occurredAt: TEST_START,
      organizationId: null,
      storeId: null,
      actorUserId: null,
      entityType: 'app_user',
      entityId,
      after,
      ip: null,
      userAgent: null,
      requestId: 'req-test',
    }),
  );
  return entityId;
}

describe('catálogo de permissões e perfis (migrations 0002, 0003, 0005 e 0008)', () => {
  it('as permissões do banco são exatamente as do código', async () => {
    const rows = await db.select({ code: permission.code }).from(permission);
    expect(rows.map((r) => r.code).sort()).toEqual([...PERMISSIONS].sort());
  });

  it('os perfis de sistema têm as permissões da matriz (maps/permissions/matriz-rbac.md)', async () => {
    const rows = await db
      .select({
        code: role.code,
        total: sql<string>`count(*)` /* BIGINT chega como texto (ADR-0003) */,
      })
      .from(role)
      .innerJoin(rolePermission, eq(rolePermission.roleId, role.id))
      .groupBy(role.code);
    expect(Object.fromEntries(rows.map((r) => [r.code, Number(r.total)]))).toEqual({
      ADMIN: 37,
      GERENTE: 36,
      CAIXA: 15,
      GARCOM: 8,
      COZINHA: 7,
    });
  });
});

describe('auditoria imutável (RN-AUDIT-02, E2-6)', () => {
  const errnoOf = (promise: Promise<unknown>) =>
    promise.then(
      () => undefined,
      (error: unknown) => mysqlErrno(error),
    );

  it('o banco recusa ALTERAR um registro de auditoria', async () => {
    const entityId = await insertEntry();
    // 1644 = erro disparado pelo trigger (SIGNAL)
    expect(
      await errnoOf(
        db.update(auditLog).set({ event: 'LOGIN' }).where(eq(auditLog.entityId, entityId)),
      ),
    ).toBe(1644);
  });

  it('o banco recusa APAGAR um registro de auditoria', async () => {
    const entityId = await insertEntry();
    expect(await errnoOf(db.delete(auditLog).where(eq(auditLog.entityId, entityId)))).toBe(1644);
  });

  it('nunca grava senha, PIN, hash ou token, mesmo se o código errar (RN-AUDIT-05)', async () => {
    const entityId = await insertEntry({
      name: 'Ana',
      password: 'segredo',
      pin: '482915',
      nested: { passwordHash: '$argon2id$x', sessionToken: 'tok', ok: 1 },
    });
    const [row] = await db
      .select({ after: auditLog.afterData })
      .from(auditLog)
      .where(eq(auditLog.entityId, entityId));
    expect(row?.after).toEqual({ name: 'Ana', nested: { ok: 1 } });
  });
});
