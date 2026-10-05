import { readFile } from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { customerOrder } from '@/shared/db/schema';
import { uuidToBuffer } from '@/shared/db/uuid-binary';
import type { Id } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import { reportsWorld } from './reports-world';

// Preenchimento de `closed_date` nas contas já fechadas antes da Etapa 9 (migration 0012 — achado
// I-5 da revisão). Roda o MESMO UPDATE da migration, só na loja do teste (o banco é compartilhado).

const { db } = useTestDatabase();
const w = reportsWorld(db);

/** O UPDATE da migration 0012, lido do arquivo (sem o ";" do fim). */
async function backfillStatement(): Promise<string> {
  const file = await readFile('drizzle/0012_financeiro_e_relatorios.sql', 'utf8');
  const start = file.indexOf('UPDATE `customer_order` o SET o.`closed_date`');
  const end = file.indexOf('--> statement-breakpoint', start);
  if (start < 0 || end < 0) throw new Error('UPDATE da 0012 não encontrado');
  const statement = file.slice(start, end).trim().replace(/;$/, '');
  if (!statement.endsWith("WHERE o.`status` = 'FECHADO'")) throw new Error('WHERE mudou');
  return statement;
}

async function closedDate(orderId: Id) {
  const [row] = await db
    .select({ date: customerOrder.closedDate })
    .from(customerOrder)
    .where(eq(customerOrder.id, orderId));
  return row?.date ?? null;
}

beforeEach(async () => {
  await w.first('carla', 'GERENTE');
  await w.withTerminal('bia', 'CAIXA', 'CX01');
  await w.person('joão', 'GARCOM');
  await w.sells('X-Burger', '32,00');
  await w.createTable('10');
  await w.openCash('bia', '0,00');
});

describe('closed_date das contas já fechadas (migration 0012)', () => {
  it('pago em caixas de dias diferentes: o dia do caixa do ÚLTIMO pagamento; cortesia: o dia da abertura', async () => {
    // Mesa 10: parte paga no caixa do dia 14, o resto no caixa do dia 15
    await w.sendTo('joão', '10', [{ quantity: 1, product: 'X-Burger' }]);
    const paid = await w.orderId({ table: '10' });
    await w.pay('bia', { table: '10' }, 'PIX', '10,00');
    // Balcão aberto no dia 14, fechado como cortesia no dia 15
    await w.counterWith('joão', 'Rafa', '20,00');
    const free = w.counter('Rafa');
    await w.closeCash('bia', { DINHEIRO: '0,00' });

    w.setClock('2026-03-15', '06:00');
    await w.openCash('bia', '0,00');
    await w.payAll('bia', { table: '10' }, 'PIX');
    await w.discountOrder('carla', { counter: 'Rafa' }, 'PERCENTUAL', 10_000, 'cortesia');
    await w.services.pos.closeFree(w.ctx('carla'), { orderId: free });

    // O código grava o dia do fechamento
    expect(await closedDate(paid)).toBe('2026-03-15');
    expect(await closedDate(free)).toBe('2026-03-15');

    // Como as contas fechadas na Etapa 8 (sem a coluna): apaga e roda o preenchimento
    await db
      .update(customerOrder)
      .set({ closedDate: null })
      .where(eq(customerOrder.storeId, w.org.centro));
    const statement = await backfillStatement();
    await db.execute(
      sql`${sql.raw(`${statement} AND o.\`store_id\` = `)}${uuidToBuffer(w.org.centro)}`,
    );

    expect(await closedDate(paid)).toBe('2026-03-15');
    // Sem pagamento, a migration usa o dia da abertura (diferença documentada — S-8)
    expect(await closedDate(free)).toBe('2026-03-14');
  });
});
