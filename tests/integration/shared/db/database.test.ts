import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { mysqlErrno } from '@/shared/db/mysql-errors';
import { runInTransaction } from '@/shared/db/transaction';
import { idempotencyRecord } from '@/shared/idempotency/schema';
import { newId } from '@/shared/kernel';
import { createTestStore, useTestDatabase } from '../../../support/database';

const { db } = useTestDatabase();

async function insertRecord(storeId: ReturnType<typeof newId>, key = newId()) {
  await db.insert(idempotencyRecord).values({
    storeId,
    idemKey: key,
    operation: 'test.op',
    requestHash: 'a'.repeat(64),
    response: null,
  });
}

describe('conexão e configuração do MySQL', () => {
  it('toda conexão usa UTC, mesmo com o servidor em -03:00 (ADR-0013)', async () => {
    // Várias consultas em paralelo para passar por conexões diferentes do pool
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        db.execute(sql`SELECT @@session.time_zone AS tz, @@global.time_zone AS gtz`),
      ),
    );
    for (const [rows] of results) {
      const row = (rows as unknown as { tz: string; gtz: string }[])[0];
      expect(row?.gtz).toBe('-03:00');
      expect(row?.tz).toBe('+00:00');
    }
  });

  it('CURRENT_TIMESTAMP grava em UTC', async () => {
    const storeId = await createTestStore(db);
    const before = Date.now();
    await insertRecord(storeId);
    const [row] = await db
      .select({ createdAt: idempotencyRecord.createdAt })
      .from(idempotencyRecord)
      .where(eq(idempotencyRecord.storeId, storeId));

    // Tolerância de 60 s: um erro de fuso seria de 3 horas
    expect(Math.abs((row?.createdAt.getTime() ?? 0) - before)).toBeLessThan(60_000);
  });

  it('sql_mode estrito', async () => {
    const [rows] = await db.execute(sql`SELECT @@session.sql_mode AS sm`);
    expect((rows as unknown as { sm: string }[])[0]?.sm).toContain('STRICT_TRANS_TABLES');
  });

  it('usuário da aplicação NÃO pode alterar a estrutura do banco (privilégio mínimo)', async () => {
    const error: unknown = await db.execute(sql`CREATE TABLE should_not_exist (id INT)`).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    // 1142 = comando negado ao usuário
    expect(mysqlErrno(error)).toBe(1142);
  });
});

describe('UUIDv7 em BINARY(16)', () => {
  it('grava e lê o mesmo id', async () => {
    const storeId = await createTestStore(db);
    const key = newId();
    await insertRecord(storeId, key);

    const [row] = await db
      .select({ storeId: idempotencyRecord.storeId, key: idempotencyRecord.idemKey })
      .from(idempotencyRecord)
      .where(eq(idempotencyRecord.storeId, storeId));

    expect(row).toEqual({ storeId, key });
  });

  it('ocupa 16 bytes no banco', async () => {
    const storeId = await createTestStore(db);
    await insertRecord(storeId);
    const [rows] = await db.execute(
      sql`SELECT LENGTH(store_id) AS len FROM idempotency_record WHERE store_id = ${idempotencyRecord.storeId.mapToDriverValue(storeId)}`,
    );
    // BIGINT chega como texto de propósito (bigNumberStrings — ADR-0003)
    expect((rows as unknown as { len: string }[])[0]?.len).toBe('16');
  });
});

describe('runInTransaction (ADR-0008)', () => {
  it('confirma as alterações quando o trabalho termina bem', async () => {
    const storeId = await createTestStore(db);
    await runInTransaction(db, async (tx) => {
      await tx.insert(idempotencyRecord).values({
        storeId,
        idemKey: newId(),
        operation: 'test.commit',
        requestHash: 'b'.repeat(64),
      });
    });

    const rows = await db
      .select()
      .from(idempotencyRecord)
      .where(eq(idempotencyRecord.storeId, storeId));
    expect(rows).toHaveLength(1);
  });

  it('desfaz tudo quando o trabalho falha', async () => {
    const storeId = await createTestStore(db);
    await expect(
      runInTransaction(db, async (tx) => {
        await tx.insert(idempotencyRecord).values({
          storeId,
          idemKey: newId(),
          operation: 'test.rollback',
          requestHash: 'c'.repeat(64),
        });
        throw new Error('falha no meio da operação');
      }),
    ).rejects.toThrow('falha no meio da operação');

    const rows = await db
      .select()
      .from(idempotencyRecord)
      .where(eq(idempotencyRecord.storeId, storeId));
    expect(rows).toHaveLength(0);
  });

  it('repete automaticamente em caso de deadlock (erro MySQL 1213)', async () => {
    let attempts = 0;
    const result = await runInTransaction(db, () => {
      attempts += 1;
      if (attempts < 3) {
        return Promise.reject(Object.assign(new Error('Deadlock found'), { errno: 1213 }));
      }
      return Promise.resolve('ok');
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('reconhece deadlock embrulhado pelo Drizzle (cause)', async () => {
    let attempts = 0;
    await runInTransaction(db, () => {
      attempts += 1;
      if (attempts === 1) {
        const cause = Object.assign(new Error('Lock wait timeout'), { errno: 1205 });
        return Promise.reject(new Error('Failed query', { cause }));
      }
      return Promise.resolve();
    });
    expect(attempts).toBe(2);
  });

  it('desiste após o número máximo de tentativas', async () => {
    let attempts = 0;
    await expect(
      runInTransaction(db, () => {
        attempts += 1;
        return Promise.reject(Object.assign(new Error('Deadlock found'), { errno: 1213 }));
      }),
    ).rejects.toThrow('Deadlock found');
    expect(attempts).toBe(3);
  });

  it('não repete erros que não são de concorrência', async () => {
    let attempts = 0;
    await expect(
      runInTransaction(db, () => {
        attempts += 1;
        return Promise.reject(new Error('regra de negócio'));
      }),
    ).rejects.toThrow('regra de negócio');
    expect(attempts).toBe(1);
  });
});
