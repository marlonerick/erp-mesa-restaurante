import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog } from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
import { newId } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import { stockWorld } from '../inventory/stock-world';

const { db } = useTestDatabase();
const w = stockWorld(db);

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'OK',
    (error: unknown) => (error as { code?: string }).code ?? String(error),
  );

beforeEach(async () => {
  await w.manager('carla');
  await w.ingredientWithCost('Carne moída', 'g', '0.040000');
  await w.ingredientWithCost('Pão', 'un', '0.800000');
  await w.createProduct('X-Burger', '32,00');
});

const save = (lines: [string, string][], version: number | null) =>
  w.services.recipes.saveRecipe(w.ctx('carla'), {
    kind: 'PRODUCT',
    id: w.product('X-Burger'),
    version,
    lines: lines.map(([name, quantity]) => ({ ingredientId: w.ingredient(name), quantity })),
  });

const detail = () =>
  w.services.recipes.getRecipe(w.ctx('carla'), { kind: 'PRODUCT', id: w.product('X-Burger') });

describe('ficha técnica (RN-REC-01 a 05)', () => {
  it('salvar igual não sobe a versão nem audita', async () => {
    await save([['Carne moída', '150']], null);
    await save([['Carne moída', '150,000']], 0);
    expect((await detail()).version).toBe(0);
    const audits = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(eq(auditLog.event, 'RECIPE_UPDATED'), eq(auditLog.entityId, w.product('X-Burger'))),
      );
    expect(audits).toHaveLength(1);
  });

  it('insumo desativado não entra; o que já estava pode continuar', async () => {
    await save([['Carne moída', '150']], null);
    const pao = await w.stock('Pão');
    await w.services.inventory.updateIngredient(w.ctx('carla'), {
      ingredientId: pao.id,
      version: pao.version,
      name: pao.name,
      active: false,
    });
    expect(
      await codeOf(
        save(
          [
            ['Carne moída', '150'],
            ['Pão', '1'],
          ],
          0,
        ),
      ),
    ).toBe('INGREDIENT_INACTIVE');
    // Carne continua ativa; desativar a carne e salvar mudando só a quantidade é permitido
    const carne = await w.stock('Carne moída');
    await w.services.inventory.updateIngredient(w.ctx('carla'), {
      ingredientId: carne.id,
      version: carne.version,
      name: carne.name,
      active: false,
    });
    expect(await codeOf(save([['Carne moída', '160']], 0))).toBe('OK');
  });

  it('duas "primeiras fichas" ao mesmo tempo: uma vence, a outra é avisada', async () => {
    const results = await Promise.all([
      codeOf(save([['Carne moída', '150']], null)),
      codeOf(save([['Carne moída', '160']], null)),
    ]);
    expect(results.sort()).toEqual(['CONCURRENT_MODIFICATION', 'OK']);
  });

  it('o custo usa o custo médio DA LOJA ativa; sem preço na loja, não há margem', async () => {
    await save([['Carne moída', '100']], null);
    await w.addPerson('rui', 'GERENTE', { store: 'Praia' });
    await w.services.inventory.registerEntry(w.ctx('rui'), {
      ingredientId: w.ingredient('Carne moída'),
      quantity: '1',
      unit: 'kg',
      paid: '60,00',
    });
    const praia = await w.services.recipes.getRecipe(w.ctx('rui'), {
      kind: 'PRODUCT',
      id: w.product('X-Burger'),
    });
    expect(praia).toMatchObject({ costCents: 600, priceCents: null, marginTenths: null });
    expect((await detail()).costCents).toBe(400);
  });

  it('produto de outra organização é invisível', async () => {
    const mine = w.product('X-Burger');
    await w.manager('intrusa');
    expect(
      await codeOf(w.services.recipes.getRecipe(w.ctx('intrusa'), { kind: 'PRODUCT', id: mine })),
    ).toBe('PRODUCT_NOT_FOUND');
  });
});

describe('baixa pela venda com a ficha (ADR-0006 A)', () => {
  it('consumeForItems baixa os insumos da ficha × quantidade', async () => {
    await save(
      [
        ['Carne moída', '150'],
        ['Pão', '1'],
      ],
      null,
    );
    await runInTransaction(db, (tx) =>
      w.services.recipes.consumeForItems(tx, w.ctx('carla'), [
        { originId: newId(), productId: w.product('X-Burger'), quantity: 2000, modifiers: [] },
      ]),
    );
    await w.expectBalance('Carne moída', '700.000');
    await w.expectBalance('Pão', '998.000');
    expect(await w.cmv('Centro')).toBe(1200 + 160);
  });

  it('produto sem ficha não baixa nada', async () => {
    const warnings = await runInTransaction(db, (tx) =>
      w.services.recipes.consumeForItems(tx, w.ctx('carla'), [
        { originId: newId(), productId: w.product('X-Burger'), quantity: 1000, modifiers: [] },
      ]),
    );
    expect(warnings).toEqual([]);
    await w.expectBalance('Carne moída', '1000.000');
  });
});
