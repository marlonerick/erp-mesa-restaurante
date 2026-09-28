import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { runInTransaction } from '@/shared/db/transaction';
import { idempotencyRecord } from '@/shared/idempotency/schema';
import { newId } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';

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
  it('sessão em UTC e sql_mode estrito', async () => {
    const [rows] = await db.execute<{ tz: string; sm: string }>(
      sql`SELECT @@session.time_zone AS tz, @@session.sql_mode AS sm`,
    );
    const row = (rows as unknown as { tz: string; sm: string }[])[0];
    expect(row?.sm).toContain('STRICT_TRANS_TABLES');
    expect(['+00:00', 'UTC', 'SYSTEM']).toContain(row?.tz);
  });

  it('usuário da aplicação NÃO pode alterar a estrutura do banco (privilégio mínimo)', async () => {
    await expect(db.execute(sql`CREATE TABLE should_not_exist (id INT)`)).rejects.toThrow();
  });
});

describe('UUIDv7 em BINARY(16)', () => {
  it('grava e lê o mesmo id', async () => {
    const storeId = newId();
    const key = newId();
    await insertRecord(storeId, key);

    const [row] = await db
      .select({ storeId: idempotencyRecord.storeId, key: idempotencyRecord.idemKey })
      .from(idempotencyRecord)
      .where(eq(idempotencyRecord.storeId, storeId));

    expect(row).toEqual({ storeId, key });
  });

  it('ocupa 16 bytes no banco', async () => {
    const storeId = newId();
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
    const storeId = newId();
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
    const storeId = newId();
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
