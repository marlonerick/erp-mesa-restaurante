import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { runInTransaction } from '@/shared/db/transaction';
import { executeIdempotent } from '@/shared/idempotency/idempotency';
import { idempotencyRecord } from '@/shared/idempotency/schema';
import { DomainError, newId } from '@/shared/kernel';
import { createTestStore, useTestDatabase } from '../../../support/database';

const { db } = useTestDatabase();

function counter() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    run: (value: unknown) => () => {
      calls += 1;
      return Promise.resolve(value);
    },
  };
}

describe('executeIdempotent — pagamento reenviado por perda de conexão (README B.4)', () => {
  it('executa na primeira vez e guarda a resposta', async () => {
    const storeId = await createTestStore(db);
    const key = newId();
    const work = counter();

    const outcome = await runInTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        { storeId, key, operation: 'payments.create', payload: { amountCents: 11000 } },
        work.run({ paymentId: 'p-1' }),
      ),
    );

    expect(outcome).toEqual({ result: { paymentId: 'p-1' }, replayed: false });
    expect(work.calls).toBe(1);
  });

  it('reenvio com a mesma chave devolve a resposta original sem executar de novo', async () => {
    const storeId = await createTestStore(db);
    const key = newId();
    const work = counter();
    const request = { storeId, key, operation: 'payments.create', payload: { amountCents: 11000 } };

    await runInTransaction(db, (tx) =>
      executeIdempotent(tx, request, work.run({ paymentId: 'p-1' })),
    );
    const replay = await runInTransaction(db, (tx) =>
      executeIdempotent(tx, request, work.run({ paymentId: 'p-2' })),
    );

    expect(replay).toEqual({ result: { paymentId: 'p-1' }, replayed: true });
    expect(work.calls).toBe(1);
  });

  it('a ordem das chaves do payload não muda a identidade da requisição', async () => {
    const storeId = await createTestStore(db);
    const key = newId();
    const work = counter();

    await runInTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        { storeId, key, operation: 'x.y', payload: { a: 1, b: { c: 2, d: 3 } } },
        work.run('ok'),
      ),
    );
    const replay = await runInTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        { storeId, key, operation: 'x.y', payload: { b: { d: 3, c: 2 }, a: 1 } },
        work.run('outra'),
      ),
    );

    expect(replay.replayed).toBe(true);
    expect(work.calls).toBe(1);
  });

  it('mesma chave com dados diferentes é recusada (409 IDEMPOTENCY_KEY_REUSED)', async () => {
    const storeId = await createTestStore(db);
    const key = newId();

    await runInTransaction(db, (tx) =>
      executeIdempotent(
        tx,
        { storeId, key, operation: 'payments.create', payload: { amountCents: 11000 } },
        () => Promise.resolve('ok'),
      ),
    );

    await expect(
      runInTransaction(db, (tx) =>
        executeIdempotent(
          tx,
          { storeId, key, operation: 'payments.create', payload: { amountCents: 99 } },
          () => Promise.resolve('ok'),
        ),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', kind: 'CONFLICT' });
  });

  it('a mesma chave em outra loja é independente (isolamento ADR-0009)', async () => {
    const key = newId();
    const work = counter();

    for (const storeId of [await createTestStore(db), await createTestStore(db)]) {
      const outcome = await runInTransaction(db, (tx) =>
        executeIdempotent(tx, { storeId, key, operation: 'x.y', payload: {} }, work.run('ok')),
      );
      expect(outcome.replayed).toBe(false);
    }
    expect(work.calls).toBe(2);
  });

  it('se a operação falha, a chave não fica gravada e o reenvio executa normalmente', async () => {
    const storeId = await createTestStore(db);
    const key = newId();
    const request = { storeId, key, operation: 'x.y', payload: {} };

    await expect(
      runInTransaction(db, (tx) =>
        executeIdempotent(tx, request, () =>
          Promise.reject(new DomainError('CASH_SESSION_REQUIRED', 'Abra o caixa.')),
        ),
      ),
    ).rejects.toMatchObject({ code: 'CASH_SESSION_REQUIRED' });

    const stored = await db
      .select()
      .from(idempotencyRecord)
      .where(and(eq(idempotencyRecord.storeId, storeId), eq(idempotencyRecord.idemKey, key)));
    expect(stored).toHaveLength(0);

    const retry = await runInTransaction(db, (tx) =>
      executeIdempotent(tx, request, () => Promise.resolve('ok')),
    );
    expect(retry).toEqual({ result: 'ok', replayed: false });
  });

  it('dois envios simultâneos com a mesma chave executam a operação uma única vez', async () => {
    const storeId = await createTestStore(db);
    const key = newId();
    const work = counter();
    const request = { storeId, key, operation: 'payments.create', payload: { amountCents: 500 } };

    const slowWork = async () => {
      const value = await work.run({ paymentId: 'único' })();
      await new Promise((resolve) => setTimeout(resolve, 200));
      return value;
    };

    const outcomes = await Promise.all([
      runInTransaction(db, (tx) => executeIdempotent(tx, request, slowWork)),
      runInTransaction(db, (tx) => executeIdempotent(tx, request, slowWork)),
    ]);

    expect(work.calls).toBe(1);
    expect(outcomes.map((o) => o.replayed).sort()).toEqual([false, true]);
    expect(outcomes.every((o) => JSON.stringify(o.result) === '{"paymentId":"único"}')).toBe(true);
  });

  it('comando sem retorno (undefined) funciona e o reenvio devolve null (revisão)', async () => {
    const request = {
      storeId: await createTestStore(db),
      key: newId(),
      operation: 'cashier.close',
      payload: {},
    };

    const first = await runInTransaction(db, (tx) =>
      executeIdempotent(tx, request, () => Promise.resolve(undefined)),
    );
    const replay = await runInTransaction(db, (tx) =>
      executeIdempotent(tx, request, () => Promise.resolve(undefined)),
    );

    expect(first).toEqual({ result: null, replayed: false });
    expect(replay).toEqual({ result: null, replayed: true });
  });

  it('primeira execução e reenvio devolvem exatamente a mesma forma JSON (revisão)', async () => {
    const request = {
      storeId: await createTestStore(db),
      key: newId(),
      operation: 'x.y',
      payload: {},
    };
    const dto = { at: new Date('2026-03-15T01:30:00.000Z'), total: 1100 };

    const first = await runInTransaction(db, (tx) =>
      executeIdempotent(tx, request, () => Promise.resolve(dto)),
    );
    const replay = await runInTransaction(db, (tx) =>
      executeIdempotent(tx, request, () => Promise.resolve(dto)),
    );

    expect(first.result).toEqual({ at: '2026-03-15T01:30:00.000Z', total: 1100 });
    expect(replay.result).toEqual(first.result);
  });

  it.each([
    ['chave que não é UUIDv7', { key: 'abc-123', operation: 'x.y' }, 'INVALID_IDEMPOTENCY_KEY'],
    [
      'operação com formato inválido',
      { key: newId(), operation: 'Payments Create' },
      'INVALID_IDEMPOTENCY_OPERATION',
    ],
  ])('recusa %s', async (_label, fields, code) => {
    await expect(
      runInTransaction(db, (tx) =>
        executeIdempotent(tx, { storeId: newId(), payload: {}, ...fields }, () =>
          Promise.resolve('ok'),
        ),
      ),
    ).rejects.toMatchObject({ code, kind: 'VALIDATION' });
  });
});
