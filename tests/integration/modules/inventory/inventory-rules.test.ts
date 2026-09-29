import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { InventoryService } from '@/modules/inventory';
import type { RecipesService } from '@/modules/recipes';
import { mysqlErrno } from '@/shared/db/mysql-errors';
import { stockMovement } from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
import { newId, PERMISSIONS, type RequestContext } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  uniqueUsername,
} from '../../../support/identity';
import { FakeRequestContext } from '../../../support/request-context';
import { costText, quantityText, stockWorld } from './stock-world';

const { db } = useTestDatabase();
const w = stockWorld(db);

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'OK',
    (error: unknown) => (error as { code?: string }).code ?? String(error),
  );

beforeEach(async () => {
  await w.manager('carla');
  await w.createIngredient('Carne moída', 'g');
  await w.createIngredient('Pão', 'un');
  await w.entry('carla', 'Carne moída', '1', 'kg', '40,00');
  await w.entry('carla', 'Pão', '100', 'un', '80,00');
});

async function otherOrganization(): Promise<RequestContext> {
  const org = await createTestOrganization(db);
  const username = uniqueUsername('intrusa');
  await createTestUser(db, {
    organizationId: org.organizationId,
    username,
    password: 'Senha@2026',
    storeRoles: [{ role: 'GERENTE', storeId: org.centro }],
  });
  return (await loginAs(w.services, username, 'Senha@2026')).ctx;
}

async function otherCompany(): Promise<RequestContext> {
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
  return new FakeRequestContext({
    userId: w.userId('sistema'),
    organizationId: w.org.organizationId,
    storeId,
    permissions: [...PERMISSIONS],
  });
}

type Attack = [
  string,
  string,
  (inv: InventoryService, rec: RecipesService, ctx: RequestContext) => Promise<unknown>,
];

const attacks = (): Attack[] => {
  const carne = w.ingredient('Carne moída');
  const amount = { ingredientId: carne, quantity: '1', unit: 'g' };
  return [
    ['getIngredient', 'INGREDIENT_NOT_FOUND', (inv, _r, x) => inv.getIngredient(x, carne)],
    [
      'updateIngredient',
      'INGREDIENT_NOT_FOUND',
      (inv, _r, x) =>
        inv.updateIngredient(x, { ingredientId: carne, version: 0, name: 'X1', active: true }),
    ],
    [
      'addConversion',
      'INGREDIENT_NOT_FOUND',
      (inv, _r, x) => inv.addConversion(x, { ingredientId: carne, unitName: 'pct', factor: '1' }),
    ],
    [
      'setMinimum',
      'INGREDIENT_NOT_FOUND',
      (inv, _r, x) => inv.setMinimum(x, { ingredientId: carne, minimum: '1' }),
    ],
    [
      'registerEntry',
      'INGREDIENT_NOT_FOUND',
      (inv, _r, x) => inv.registerEntry(x, { ...amount, paid: '1,00' }),
    ],
    [
      'registerExit',
      'INGREDIENT_NOT_FOUND',
      (inv, _r, x) => inv.registerExit(x, { ...amount, note: 'teste de invasão' }),
    ],
    [
      'registerLoss',
      'INGREDIENT_NOT_FOUND',
      (inv, _r, x) => inv.registerLoss(x, { ...amount, reason: 'VENCIDO' }),
    ],
    ['registerCount', 'INGREDIENT_NOT_FOUND', (inv, _r, x) => inv.registerCount(x, amount)],
    [
      'consumeStock',
      'INGREDIENT_NOT_FOUND',
      (inv, _r, x) =>
        runInTransaction(db, (tx) =>
          inv.consumeStock(tx, x, [{ ingredientId: carne, quantity: 1000, originId: newId() }]),
        ),
    ],
    [
      'saveRecipe com insumo alheio',
      'INGREDIENT_NOT_FOUND',
      async (_i, rec, x) => {
        // Produto do PRÓPRIO atacante, insumo da vítima
        const product = await w.services.catalog.createProduct(x, {
          name: `Isca ${newId().slice(-6)}`,
          categoryId: (
            await w.services.catalog.createCategory(x, { name: `Cat ${newId().slice(-6)}` })
          ).id,
          sku: null,
          description: null,
          requiresPreparation: true,
          modifierGroupIds: [],
          priceHereCents: null,
        });
        return rec.saveRecipe(x, {
          kind: 'PRODUCT',
          id: product.id,
          version: null,
          lines: [{ ingredientId: carne, quantity: '1' }],
        });
      },
    ],
  ];
};

describe('isolamento (RN-INV-01, ADR-0009)', () => {
  it('outra organização não vê nem mexe em nenhum insumo', async () => {
    const intrusa = await otherOrganization();
    for (const [label, code, attack] of attacks()) {
      expect(await codeOf(attack(w.services.inventory, w.services.recipes, intrusa)), label).toBe(
        code,
      );
    }
    expect(await w.services.inventory.listIngredients(intrusa)).toEqual([]);
    await w.expectBalance('Carne moída', '1000.000', '0.040000');
  });

  it('outra empresa da mesma organização também não', async () => {
    const norte = await otherCompany();
    for (const [label, code, attack] of attacks()) {
      expect(await codeOf(attack(w.services.inventory, w.services.recipes, norte)), label).toBe(
        code,
      );
    }
    await w.expectBalance('Carne moída', '1000.000', '0.040000');
  });

  it('o saldo é por loja: a Praia começa do zero e não mexe no Centro', async () => {
    await w.addPerson('rui', 'GERENTE', { store: 'Praia' });
    const praia = await w.services.inventory.getIngredient(
      w.ctx('rui'),
      w.ingredient('Carne moída'),
    );
    expect(praia.quantity).toBe(0);
    await w.services.inventory.registerEntry(w.ctx('rui'), {
      ingredientId: w.ingredient('Carne moída'),
      quantity: '500',
      unit: 'g',
      paid: '30,00',
    });
    await w.expectBalance('Carne moída', '1000.000', '0.040000');
    const after = await w.services.inventory.getIngredient(
      w.ctx('rui'),
      w.ingredient('Carne moída'),
    );
    expect(quantityText(after.quantity)).toBe('500.000');
    expect(costText(after.avgCostMicros)).toBe('0.060000');
  });
});

describe('concorrência (RN-INV-16)', () => {
  it('10 consumos simultâneos no mesmo insumo: nenhum se perde', async () => {
    await Promise.all(Array.from({ length: 10 }, () => w.consume('Carne moída', 10_000)));
    await w.expectBalance('Carne moída', '900.000');
  });

  it('entradas simultâneas recalculam o custo médio sem perder nenhuma', async () => {
    await Promise.all([
      w.entry('carla', 'Carne moída', '1', 'kg', '50,00'),
      w.entry('carla', 'Carne moída', '1', 'kg', '50,00'),
    ]);
    // (1000 × 0,04 + 50 + 50) ÷ 3000 = 0,046667
    await w.expectBalance('Carne moída', '3000.000', '0.046667');
  });

  it('consumos simultâneos com insumos em ordem invertida não travam (ordem fixa de trava)', async () => {
    const carne = w.ingredient('Carne moída');
    const pao = w.ingredient('Pão');
    for (let round = 0; round < 5; round += 1) {
      await Promise.all([
        runInTransaction(db, (tx) =>
          w.services.inventory.consumeStock(tx, w.ctx('carla'), [
            { ingredientId: carne, quantity: 1000, originId: newId() },
            { ingredientId: pao, quantity: 1000, originId: newId() },
          ]),
        ),
        runInTransaction(db, (tx) =>
          w.services.inventory.consumeStock(tx, w.ctx('carla'), [
            { ingredientId: pao, quantity: 1000, originId: newId() },
            { ingredientId: carne, quantity: 1000, originId: newId() },
          ]),
        ),
      ]);
    }
    await w.expectBalance('Carne moída', '990.000');
    await w.expectBalance('Pão', '90.000');
  });

  it('o extrato fecha: saldo = soma das movimentações e cada "saldo depois" encadeia', async () => {
    await Promise.all([
      w.consume('Carne moída', 50_000),
      w.entry('carla', 'Carne moída', '200', 'g', '9,00'),
      w.consume('Carne moída', 25_000),
    ]);
    const detail = await w.stock('Carne moída');
    const chronological = [...detail.movements].reverse();
    let running = 0;
    for (const movement of chronological) {
      running += movement.quantity;
      expect(movement.balanceAfter).toBe(running);
    }
    expect(running).toBe(detail.quantity);
  });
});

describe('regras de borda', () => {
  it('movimentação é imutável no banco (RN-INV-17)', async () => {
    const [row] = await db
      .select({ id: stockMovement.id })
      .from(stockMovement)
      .where(eq(stockMovement.ingredientId, w.ingredient('Carne moída')))
      .limit(1);
    const id = row?.id ?? newId();
    const errnoOf = (promise: Promise<unknown>) =>
      promise.then(
        () => undefined,
        (error: unknown) => mysqlErrno(error),
      );
    expect(
      await errnoOf(
        db.update(stockMovement).set({ note: 'fraude' }).where(eq(stockMovement.id, id)),
      ),
    ).toBe(1644);
    expect(await errnoOf(db.delete(stockMovement).where(eq(stockMovement.id, id)))).toBe(1644);
  });

  it('estorno usa o custo do CONSUMO, mesmo que o custo médio tenha mudado depois', async () => {
    const item = await w.consume('Carne moída', 100_000); // 100 g a R$ 0,04 = R$ 4,00
    await w.entry('carla', 'Carne moída', '900', 'g', '90,00'); // custo médio sobe
    await runInTransaction(db, (tx) =>
      w.services.inventory.reverseConsumption(tx, w.ctx('carla'), item),
    );
    expect(await w.cmv('Centro')).toBe(0);
    const [estorno] = await db
      .select({ value: stockMovement.valueCents, cost: stockMovement.unitCost })
      .from(stockMovement)
      .where(and(eq(stockMovement.originId, item), eq(stockMovement.type, 'ESTORNO_VENDA')));
    expect(estorno).toEqual({ value: 400, cost: '0.040000' });
  });

  it('com BLOQUEAR, falta em UM insumo recusa o consumo inteiro', async () => {
    await w.blockNegative('Centro');
    const code = await codeOf(
      runInTransaction(db, (tx) =>
        w.services.inventory.consumeStock(tx, w.ctx('carla'), [
          { ingredientId: w.ingredient('Pão'), quantity: 1000, originId: newId() },
          { ingredientId: w.ingredient('Carne moída'), quantity: 2_000_000, originId: newId() },
        ]),
      ),
    );
    expect(code).toBe('INSUFFICIENT_STOCK');
    await w.expectBalance('Pão', '100.000');
    await w.expectBalance('Carne moída', '1000.000');
  });

  it('entrada por conversão do insumo ("fardo" = 12 un) e extrato com o texto digitado', async () => {
    await w.services.inventory.addConversion(w.ctx('carla'), {
      ingredientId: w.ingredient('Pão'),
      unitName: 'fardo',
      factor: '12',
    });
    const [fardo] = (await w.stock('Pão')).conversions;
    await w.services.inventory.registerEntry(w.ctx('carla'), {
      ingredientId: w.ingredient('Pão'),
      quantity: '2',
      unit: fardo?.id ?? '',
      paid: '19,20',
    });
    const detail = await w.stock('Pão');
    expect(quantityText(detail.quantity)).toBe('124.000');
    expect(detail.movements[0]).toMatchObject({ type: 'ENTRADA', enteredText: '2 fardo' });
    // Quem fez aparece pelo nome (módulo Users)
    expect(detail.movements[0]?.userName).toMatch(/^carla./);
  });

  it('insumo desativado não recebe entrada, mas a contagem ainda corrige o saldo', async () => {
    const carne = await w.stock('Carne moída');
    await w.services.inventory.updateIngredient(w.ctx('carla'), {
      ingredientId: carne.id,
      version: carne.version,
      name: carne.name,
      active: false,
    });
    expect(await codeOf(w.entry('carla', 'Carne moída', '1', 'kg', '40,00'))).toBe(
      'INGREDIENT_INACTIVE',
    );
    await w.services.inventory.registerCount(w.ctx('carla'), {
      ingredientId: carne.id,
      quantity: '0',
      unit: 'g',
    });
    await w.expectBalance('Carne moída', '0.000');
  });

  it('perda "OUTRO" exige observação; unidade de outra base é recusada', async () => {
    const carne = w.ingredient('Carne moída');
    expect(
      await codeOf(
        w.services.inventory.registerLoss(w.ctx('carla'), {
          ingredientId: carne,
          quantity: '10',
          unit: 'g',
          reason: 'OUTRO',
        }),
      ),
    ).toBe('NOTE_REQUIRED');
    expect(
      await codeOf(
        w.services.inventory.registerExit(w.ctx('carla'), {
          ingredientId: carne,
          quantity: '1',
          unit: 'L',
          note: 'uso interno',
        }),
      ),
    ).toBe('INVALID_UNIT');
  });

  it('nome de insumo repetido na empresa (maiúsculas e acentos não contam)', async () => {
    expect(
      await codeOf(
        w.services.inventory.createIngredient(w.ctx('carla'), {
          name: 'CARNE MOIDA',
          baseUnit: 'g',
        }),
      ),
    ).toBe('INGREDIENT_NAME_TAKEN');
  });

  it('CMV soma só consumo menos estorno; perdas manuais ficam à parte', async () => {
    await w.consume('Carne moída', 100_000); // R$ 4,00
    await w.services.inventory.registerLoss(w.ctx('carla'), {
      ingredientId: w.ingredient('Carne moída'),
      quantity: '50',
      unit: 'g',
      reason: 'VENCIDO',
    }); // R$ 2,00
    expect(await w.cmv('Centro')).toBe(400);
    expect(await w.losses('Centro')).toBe(200);
  });
});
