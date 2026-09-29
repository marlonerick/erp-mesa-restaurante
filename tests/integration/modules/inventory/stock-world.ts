import { and, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { parsePriceText } from '@/modules/catalog';
import { costOfGoodsSold, lossesValue, type StockShortage } from '@/modules/inventory';
import type { Database } from '@/shared/db/client';
import { auditLog, store } from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
import {
  formatMoneyText,
  type Id,
  newId,
  operationalDate,
  type RequestContext,
  type SystemRole,
  UnitCost,
} from '@/shared/kernel';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  TEST_START,
  type TestOrganization,
  testServices,
  uniqueUsername,
} from '../../../support/identity';

type StoreName = 'Centro' | 'Praia';

/** Dia operacional do relógio dos testes (18:00 em São Paulo). */
export const TODAY = operationalDate(TEST_START, 'America/Sao_Paulo', '05:00');

/**
 * Estado compartilhado pelos cenários de estoque e ficha técnica: organização nova (Centro e Praia),
 * pessoas, insumos, produtos e adicionais por nome.
 */
export function stockWorld(db: Database) {
  const services = testServices(db);
  let org: TestOrganization;
  const people = new Map<string, { id: Id; ctx: RequestContext }>();
  const ingredients = new Map<string, Id>();
  const products = new Map<string, Id>();
  const modifiers = new Map<string, Id>();
  let failure: unknown = null;
  let lastWarnings: StockShortage[] = [];

  const storeId = (name: StoreName) => (name === 'Centro' ? org.centro : org.praia);
  function get<T>(map: Map<string, T>, name: string, what: string): T {
    const value = map.get(name);
    if (value === undefined) throw new Error(`${what} "${name}" não existe no cenário`);
    return value;
  }

  async function addPerson(
    name: string,
    role: SystemRole,
    scope: { store: StoreName } | 'organization',
  ) {
    const username = uniqueUsername(name);
    const id = await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Senha@2026',
      ...(scope === 'organization'
        ? { organizationRole: role }
        : { storeRoles: [{ role, storeId: storeId(scope.store) }] }),
    });
    const { ctx } = await loginAs(services, username, 'Senha@2026');
    people.set(name, { id, ctx });
  }

  const w = {
    services,
    get org() {
      return org;
    },
    get failure() {
      return failure;
    },
    get lastWarnings() {
      return lastWarnings;
    },
    storeId,
    ctx: (name: string) => get(people, name, 'pessoa').ctx,
    userId: (name: string) => get(people, name, 'pessoa').id,
    ingredient: (name: string) => get(ingredients, name, 'insumo'),
    product: (name: string) => get(products, name, 'produto'),
    modifier: (name: string) => get(modifiers, name, 'adicional'),
    addPerson,

    /** Organização nova + "sistema" (administradora) para os dados de apoio. */
    async newOrganization() {
      people.clear();
      ingredients.clear();
      products.clear();
      modifiers.clear();
      failure = null;
      lastWarnings = [];
      org = await createTestOrganization(db);
      await addPerson('sistema', 'ADMIN', 'organization');
    },
    async manager(name: string, store: StoreName = 'Centro') {
      await w.newOrganization();
      await addPerson(name, 'GERENTE', { store });
    },

    async attempt(work: () => Promise<unknown>) {
      failure = null;
      try {
        await work();
      } catch (error) {
        failure = error;
      }
    },

    async blockNegative(storeName: StoreName) {
      await db
        .update(store)
        .set({ negativeStockPolicy: 'BLOQUEAR' })
        .where(eq(store.id, storeId(storeName)));
    },

    async createIngredient(name: string, baseUnit: string) {
      const { id } = await services.inventory.createIngredient(w.ctx('sistema'), {
        name,
        baseUnit,
      });
      ingredients.set(name, id);
    },

    /** Deixa o insumo com este custo médio no Centro: 1000 unidades base pelo valor certo. */
    async ingredientWithCost(name: string, baseUnit: string, micros: string) {
      await w.createIngredient(name, baseUnit);
      // 1000 unidades × custo (micro-reais) = centavos: micros × 1000 ÷ 10⁴
      const cents = Number(UnitCost.fromDecimalString(micros).micros / 10n);
      await services.inventory.registerEntry(w.ctx('sistema'), {
        ingredientId: w.ingredient(name),
        quantity: '1000',
        unit: baseUnit,
        paid: formatMoneyText(cents),
      });
    },

    async entry(by: string, ingredient: string, quantity: string, unit: string, paid: string) {
      await services.inventory.registerEntry(w.ctx(by), {
        ingredientId: w.ingredient(ingredient),
        quantity,
        unit,
        paid,
      });
    },

    async stock(ingredient: string) {
      return services.inventory.getIngredient(w.ctx('sistema'), w.ingredient(ingredient));
    },

    async expectBalance(ingredient: string, balance: string, avgCost?: string) {
      const found = await w.stock(ingredient);
      expect(quantityText(found.quantity)).toBe(balance);
      if (avgCost !== undefined) expect(costText(found.avgCostMicros)).toBe(avgCost);
    },

    /** Um item do pedido (origem nova) consumindo a quantidade, na transação da "comanda". */
    async consume(ingredient: string, quantityThousandths: number, originId: Id = newId()) {
      lastWarnings = await runInTransaction(db, (tx) =>
        services.inventory.consumeStock(tx, w.ctx('carla'), [
          { ingredientId: w.ingredient(ingredient), quantity: quantityThousandths, originId },
        ]),
      );
      return originId;
    },

    async cmv(storeName: StoreName) {
      return runInTransaction(db, (tx) =>
        costOfGoodsSold(tx, { storeId: storeId(storeName), from: TODAY, to: TODAY }),
      );
    },
    async losses(storeName: StoreName) {
      return runInTransaction(db, (tx) =>
        lossesValue(tx, { storeId: storeId(storeName), from: TODAY, to: TODAY }),
      );
    },

    async createProduct(name: string, price: string) {
      const ctx = w.ctx('sistema');
      const categories = await services.catalog.listCategories(ctx);
      const categoryId =
        categories[0]?.id ?? (await services.catalog.createCategory(ctx, { name: 'Lanches' })).id;
      const { id } = await services.catalog.createProduct(ctx, {
        name,
        categoryId,
        sku: null,
        description: null,
        requiresPreparation: true,
        modifierGroupIds: [],
        priceHereCents: parsePriceText(price),
      });
      products.set(name, id);
    },

    async createModifier(name: string, group: string) {
      const ctx = w.ctx('sistema');
      const { id: groupId } = await services.catalog.createModifierGroup(ctx, {
        name: group,
        minSelect: 0,
        maxSelect: 3,
      });
      const { id } = await services.catalog.createModifier(ctx, {
        groupId,
        name,
        priceDeltaCents: 500,
      });
      modifiers.set(name, id);
    },

    async expectAudit(event: string, by: string) {
      const rows = await db
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(and(eq(auditLog.event, event), eq(auditLog.actorUserId, w.userId(by))));
      expect(rows.length).toBeGreaterThan(0);
    },

    expectFailure(code: string) {
      expect(failure).toMatchObject({ code });
    },
  };
  return w;
}

export const quantityText = (thousandths: number) => {
  const sign = thousandths < 0 ? '-' : '';
  const magnitude = Math.abs(thousandths);
  return `${sign}${String(Math.trunc(magnitude / 1000))}.${String(magnitude % 1000).padStart(3, '0')}`;
};

export const costText = (micros: bigint) =>
  `${(micros / 1_000_000n).toString()}.${(micros % 1_000_000n).toString().padStart(6, '0')}`;

export type StockWorld = ReturnType<typeof stockWorld>;
