import { and, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { listStoreMenu, parsePriceText } from '@/modules/catalog';
import type { Database } from '@/shared/db/client';
import { auditLog } from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
import type { Id, RequestContext, SystemRole } from '@/shared/kernel';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  type TestOrganization,
  testServices,
  uniqueUsername,
} from '../../../support/identity';

type StoreName = 'Centro' | 'Praia';

/**
 * Estado compartilhado pelos cenários do catálogo: uma organização nova por cenário (Centro e
 * Praia na mesma empresa), as pessoas e os nomes → ids do que foi cadastrado.
 */
export function catalogWorld(db: Database) {
  const services = testServices(db);
  let org: TestOrganization;
  const people = new Map<string, { id: Id; ctx: RequestContext }>();
  const categories = new Map<string, Id>();
  const products = new Map<string, Id>();
  const groups = new Map<string, Id>();
  let failure: unknown = null;

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

  const world = {
    services,
    catalog: services.catalog,
    get org() {
      return org;
    },
    get failure() {
      return failure;
    },
    storeId,
    ctx: (name: string) => get(people, name, 'pessoa').ctx,
    userId: (name: string) => get(people, name, 'pessoa').id,
    category: (name: string) => get(categories, name, 'categoria'),
    product: (name: string) => get(products, name, 'produto'),
    group: (name: string) => get(groups, name, 'grupo'),

    /** Organização nova + quem vai cadastrar os dados de apoio ("existe a categoria..."). */
    async newOrganization() {
      people.clear();
      categories.clear();
      products.clear();
      groups.clear();
      failure = null;
      org = await createTestOrganization(db);
      await addPerson('sistema', 'ADMIN', 'organization');
    },
    async manager(name: string, store: StoreName = 'Centro') {
      await world.newOrganization();
      await addPerson(name, 'GERENTE', { store });
    },
    async admin(name: string) {
      await world.newOrganization();
      await addPerson(name, 'ADMIN', 'organization');
    },
    addPerson,

    async attempt(work: () => Promise<unknown>) {
      failure = null;
      try {
        await work();
      } catch (error) {
        failure = error;
      }
    },

    async createCategory(name: string, by = 'sistema') {
      const { id } = await services.catalog.createCategory(world.ctx(by), { name });
      categories.set(name, id);
    },

    async createProduct(
      by: string,
      input: { name: string; category: string; price?: string | null; groups?: string[] },
    ) {
      const { id } = await services.catalog.createProduct(world.ctx(by), {
        name: input.name,
        categoryId: world.category(input.category),
        sku: null,
        description: null,
        requiresPreparation: true,
        modifierGroupIds: (input.groups ?? []).map((group) => world.group(group)),
        priceHereCents: input.price ? cents(input.price) : null,
      });
      products.set(input.name, id);
    },

    async createGroup(by: string, name: string, minSelect: number, maxSelect: number) {
      const { id } = await services.catalog.createModifierGroup(world.ctx(by), {
        name,
        minSelect,
        maxSelect,
      });
      groups.set(name, id);
    },

    /** Como a tela: lê o preço (versão) e salva. */
    async setPrice(by: string, product: string, store: StoreName, price: string) {
      const view = await services.catalog.getProduct(world.ctx('sistema'), world.product(product));
      const current = view.prices.find((item) => item.storeId === storeId(store))?.price ?? null;
      await services.catalog.setStorePrice(world.ctx(by), {
        productId: world.product(product),
        storeId: storeId(store),
        priceCents: cents(price),
        version: current?.version ?? null,
      });
    },

    async menu(store: StoreName) {
      return runInTransaction(db, (tx) =>
        listStoreMenu(tx, { companyId: org.companyId, storeId: storeId(store) }),
      );
    },

    async expectOnMenu(store: StoreName, product: string, priceCents: number) {
      const item = (await world.menu(store)).find((row) => row.name === product);
      expect(item?.priceCents).toBe(priceCents);
    },

    async expectNotOnMenu(store: StoreName, product: string) {
      expect((await world.menu(store)).map((row) => row.name)).not.toContain(product);
    },

    async expectAudit(event: string, by: string) {
      const rows = await db
        .select({ actor: auditLog.actorUserId })
        .from(auditLog)
        .where(and(eq(auditLog.event, event), eq(auditLog.actorUserId, world.userId(by))));
      expect(rows.length).toBeGreaterThan(0);
    },

    expectFailure(code: string) {
      expect(failure).toMatchObject({ code });
    },
  };
  return world;
}

/** "32,50" → 3250 (a mesma leitura da tela). */
export const cents = (text: string): number => parsePriceText(text);

export type CatalogWorld = ReturnType<typeof catalogWorld>;
