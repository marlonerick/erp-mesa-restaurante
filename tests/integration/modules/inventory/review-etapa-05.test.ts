// Achados da revisão da Etapa 5 (docs/weeks/etapa-05.md): cada teste reproduz um cenário.
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { mysqlErrno } from '@/shared/db/mysql-errors';
import { stockMovement } from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
import { type Id, newId } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import { stockWorld } from './stock-world';

const { db } = useTestDatabase();
const w = stockWorld(db);
const ROUNDS = 5;

beforeEach(async () => {
  await w.manager('carla');
  await w.createIngredient('Carne moída', 'g');
  await w.entry('carla', 'Carne moída', '1', 'kg', '40,00');
});

const reverse = (item: Id) =>
  runInTransaction(db, (tx) => w.services.inventory.reverseConsumption(tx, w.ctx('carla'), item));
const toLoss = (item: Id) =>
  runInTransaction(db, (tx) => w.services.inventory.consumptionToLoss(tx, w.ctx('carla'), item));

async function movementsOf(item: Id) {
  return db
    .select({ type: stockMovement.type, quantity: stockMovement.quantity })
    .from(stockMovement)
    .where(and(eq(stockMovement.originId, item), eq(stockMovement.originType, 'ORDER_ITEM')));
}

describe('I-3: isolamento e permissões em todos os casos de uso', () => {
  const codeOf = (promise: Promise<unknown>) =>
    promise.then(
      () => 'OK',
      (error: unknown) => (error as { code?: string }).code ?? String(error),
    );

  it('cozinha não faz NENHUM lançamento nem cadastro (E5-1)', async () => {
    await w.addPerson('teo', 'COZINHA', { store: 'Centro' });
    const teo = w.ctx('teo');
    const inv = w.services.inventory;
    const carne = w.ingredient('Carne moída');
    const amount = { ingredientId: carne, quantity: '1', unit: 'g' };
    const detail = await w.stock('Carne moída');
    const attempts: [string, Promise<unknown>][] = [
      ['createIngredient', inv.createIngredient(teo, { name: 'Sal', baseUnit: 'g' })],
      [
        'updateIngredient',
        inv.updateIngredient(teo, { ingredientId: carne, version: 0, name: 'X1', active: true }),
      ],
      [
        'addConversion',
        inv.addConversion(teo, { ingredientId: carne, unitName: 'pct', factor: '5' }),
      ],
      [
        'removeConversion',
        inv.removeConversion(teo, { conversionId: detail.conversions[0]?.id ?? carne }),
      ],
      ['setMinimum', inv.setMinimum(teo, { ingredientId: carne, minimum: '1' })],
      ['registerEntry', inv.registerEntry(teo, { ...amount, paid: '1,00' })],
      ['registerExit', inv.registerExit(teo, { ...amount, note: 'uso interno' })],
      ['registerLoss', inv.registerLoss(teo, { ...amount, reason: 'VENCIDO' })],
      ['registerCount', inv.registerCount(teo, amount)],
    ];
    for (const [label, attempt] of attempts) {
      expect(await codeOf(attempt), label).toBe('FORBIDDEN');
    }
    // ...mas lê (inventory.read)
    expect(await codeOf(inv.getIngredient(teo, carne))).toBe('OK');
    await w.expectBalance('Carne moída', '1000.000', '0.040000');
  });

  it('conversão de insumo de outra organização não é excluída', async () => {
    await w.services.inventory.addConversion(w.ctx('carla'), {
      ingredientId: w.ingredient('Carne moída'),
      unitName: 'pacote',
      factor: '500',
    });
    const [pacote] = (await w.stock('Carne moída')).conversions;
    const conversionId = pacote?.id ?? w.ingredient('Carne moída');
    const victim = w.ingredient('Carne moída');
    const victimCtx = w.ctx('carla');
    await w.manager('intrusa'); // outra organização
    expect(
      await codeOf(w.services.inventory.removeConversion(w.ctx('intrusa'), { conversionId })),
    ).toBe('CONVERSION_NOT_FOUND');
    const after = await w.services.inventory.getIngredient(victimCtx, victim);
    expect(after.conversions.map((item) => item.unitName)).toEqual(['pacote']);
  });

  it('estorno pedido na Praia não mexe no consumo feito no Centro', async () => {
    const item = await w.consume('Carne moída', 150_000);
    await w.addPerson('rui', 'GERENTE', { store: 'Praia' });
    await runInTransaction(db, (tx) =>
      w.services.inventory.reverseConsumption(tx, w.ctx('rui'), item),
    );
    await w.expectBalance('Carne moída', '850.000');
    expect(await w.cmv('Centro')).toBe(600);
  });
});

describe('S-1: o banco recusa movimentação inconsistente, mesmo gravada por fora do sistema', () => {
  const base = () => ({
    id: newId(),
    storeId: w.org.centro,
    ingredientId: w.ingredient('Carne moída'),
    unitCost: '0.040000',
    valueCents: 0,
    balanceAfter: '0.000',
    originType: 'MANUAL' as const,
    userId: w.userId('carla'),
    occurredAt: new Date(),
    operationalDate: '2026-03-14',
  });
  const errnoOf = (promise: Promise<unknown>) =>
    promise.then(
      () => 'OK',
      (error: unknown) => mysqlErrno(error),
    );

  it.each([
    ['quantidade zero', { type: 'AJUSTE' as const, quantity: '0.000' }],
    ['entrada negativa', { type: 'ENTRADA' as const, quantity: '-1.000' }],
    ['consumo positivo', { type: 'CONSUMO_VENDA' as const, quantity: '1.000' }],
    ['perda sem motivo', { type: 'PERDA' as const, quantity: '-1.000' }],
    [
      'motivo de perda numa saída',
      { type: 'SAIDA' as const, quantity: '-1.000', lossReason: 'VENCIDO' as const },
    ],
  ])('%s', async (_label, fields) => {
    // 3819 = CHECK constraint violada
    expect(await errnoOf(db.insert(stockMovement).values({ ...base(), ...fields }))).toBe(3819);
  });

  it('consumo de venda sem o item de origem', async () => {
    expect(
      await errnoOf(
        db.insert(stockMovement).values({
          ...base(),
          type: 'CONSUMO_VENDA',
          quantity: '-1.000',
          originType: 'ORDER_ITEM',
        }),
      ),
    ).toBe(3819);
  });
});

describe('S-5: um aviso por insumo, somando as linhas do mesmo insumo', () => {
  it('duas linhas de carne que estouram o saldo geram UM aviso com o total pedido', async () => {
    const [first, second] = [newId(), newId()];
    const carne = w.ingredient('Carne moída');
    const warnings = await runInTransaction(db, (tx) =>
      w.services.inventory.consumeStock(tx, w.ctx('carla'), [
        { ingredientId: carne, quantity: 700_000, originId: first },
        { ingredientId: carne, quantity: 600_000, originId: second },
      ]),
    );
    expect(warnings).toEqual([
      expect.objectContaining({ ingredientId: carne, balance: 1_000_000, required: 1_300_000 }),
    ]);
  });
});

describe('B-1: estorno e perda por cancelamento são idempotentes MESMO ao mesmo tempo', () => {
  it('dois estornos simultâneos do mesmo item devolvem uma vez só', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const item = await w.consume('Carne moída', 150_000);
      await Promise.all([reverse(item), reverse(item)]);
      expect((await movementsOf(item)).map((row) => row.type).sort()).toEqual([
        'CONSUMO_VENDA',
        'ESTORNO_VENDA',
      ]);
    }
    await w.expectBalance('Carne moída', '1000.000');
    expect(await w.cmv('Centro')).toBe(0);
  });

  it('estorno e perda simultâneos: só um dos dois acontece', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const item = await w.consume('Carne moída', 100_000);
      await Promise.all([reverse(item), toLoss(item)]);
      const types = (await movementsOf(item)).map((row) => row.type).sort();
      // Ou só o estorno (voltou ao estoque) ou estorno + perda (virou perda) — nunca os dois
      expect([
        ['CONSUMO_VENDA', 'ESTORNO_VENDA'],
        ['CONSUMO_VENDA', 'ESTORNO_VENDA', 'PERDA'],
      ]).toContainEqual(types);
    }
    expect(await w.cmv('Centro')).toBe(0);
  });

  it('não depende de quem chama: transação que já leu o banco antes também não duplica', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const item = await w.consume('Carne moída', 50_000);
      await Promise.all([
        runInTransaction(db, async (tx) => {
          // Leitura comum ANTES (como a comanda lendo o pedido): fixa a "foto" da transação
          await tx.select({ id: stockMovement.id }).from(stockMovement).limit(1);
          await new Promise((resolve) => setTimeout(resolve, 20));
          await w.services.inventory.reverseConsumption(tx, w.ctx('carla'), item);
        }),
        reverse(item),
      ]);
      expect((await movementsOf(item)).filter((row) => row.type === 'ESTORNO_VENDA')).toHaveLength(
        1,
      );
    }
    await w.expectBalance('Carne moída', '1000.000');
    expect(await w.cmv('Centro')).toBe(0);
  });
});
