import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog } from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
import { newId, PERMISSIONS } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import { FakeRequestContext } from '../../../support/request-context';
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

describe('achados da revisão da Etapa 5', () => {
  it('I-1: ficha sem linhas é "sem ficha" (não R$ 0,00 com margem de 100%)', async () => {
    await save([], null); // primeira ficha vazia: nada é gravado
    expect(await detail()).toMatchObject({ hasRecipe: false, version: null, marginTenths: null });
    await save([['Carne moída', '150']], null);
    await save([], 0); // tirou todas as linhas
    const list = await w.services.recipes.listRecipes(w.ctx('carla'));
    expect(list.products.find((item) => item.name === 'X-Burger')).toMatchObject({
      hasRecipe: false,
      marginTenths: null,
    });
  });

  it('I-3: produto de OUTRA EMPRESA da mesma organização é invisível e não recebe ficha', async () => {
    const admin = w.ctx('sistema');
    const { id: companyId } = await w.services.organizations.createCompany(admin, {
      legalName: 'Filial B Ltda',
      tradeName: 'Filial B',
      cnpj: null,
    });
    const { id: storeId } = await w.services.organizations.createStore(admin, {
      companyId,
      name: 'Norte',
      code: 'NORTE',
    });
    const norte = new FakeRequestContext({
      userId: w.userId('sistema'),
      organizationId: w.org.organizationId,
      storeId,
      permissions: [...PERMISSIONS],
    });
    const target = { kind: 'PRODUCT' as const, id: w.product('X-Burger') };
    expect(await codeOf(w.services.recipes.getRecipe(norte, target))).toBe('PRODUCT_NOT_FOUND');
    expect(
      await codeOf(w.services.recipes.saveRecipe(norte, { ...target, version: null, lines: [] })),
    ).toBe('PRODUCT_NOT_FOUND');
  });

  it('I-3: vender produto alheio não baixa nada (a ficha é buscada na empresa da loja)', async () => {
    await save([['Carne moída', '150']], null);
    const product = w.product('X-Burger');
    await w.manager('intrusa');
    await w.ingredientWithCost('Carne moída', 'g', '0.040000');
    await runInTransaction(db, (tx) =>
      w.services.recipes.consumeForItems(tx, w.ctx('intrusa'), [
        { originId: newId(), productId: product, quantity: 1000, modifiers: [] },
      ]),
    );
    await w.expectBalance('Carne moída', '1000.000');
  });

  it('I-3: venda com adicional grava o consumo da ficha do adicional', async () => {
    await save([['Carne moída', '150']], null);
    await w.createModifier('Carne extra', 'Extras');
    await w.services.recipes.saveRecipe(w.ctx('carla'), {
      kind: 'MODIFIER',
      id: w.modifier('Carne extra'),
      version: null,
      lines: [{ ingredientId: w.ingredient('Carne moída'), quantity: '50' }],
    });
    await runInTransaction(db, (tx) =>
      w.services.recipes.consumeForItems(tx, w.ctx('carla'), [
        {
          originId: newId(),
          productId: w.product('X-Burger'),
          quantity: 2000,
          modifiers: [{ modifierId: w.modifier('Carne extra'), quantity: 1000 }],
        },
      ]),
    );
    // 2 × (150 + 50) = 400 g
    await w.expectBalance('Carne moída', '600.000');
    expect(await w.cmv('Centro')).toBe(1600);
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
