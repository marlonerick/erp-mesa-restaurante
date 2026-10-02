import { and, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { lossesValue } from '@/modules/inventory';
import type { SendResult } from '@/modules/orders';
import type { Database } from '@/shared/db/client';
import {
  auditLog,
  customerOrder,
  diningTable,
  kitchenTicket,
  orderItem,
  productStore,
  store,
} from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
import type { Jsonified } from '@/shared/idempotency/idempotency';
import {
  type Id,
  newId,
  parseMoneyText,
  type RequestContext,
  type SystemRole,
} from '@/shared/kernel';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  type TestOrganization,
  testServices,
  uniqueUsername,
} from '../../../support/identity';
import { quantityText, TODAY } from '../inventory/stock-world';

type StoreName = 'Centro' | 'Praia';

function cents(text: string): number {
  const value = parseMoneyText(text);
  if (value === null) throw new Error(`valor inválido: ${text}`);
  return value;
}

/**
 * Estado compartilhado pelos cenários do salão: organização nova (Centro e Praia), pessoas,
 * cardápio, insumos, mesas e contas por nome.
 */
export function floorWorld(db: Database) {
  const services = testServices(db);
  let org: TestOrganization;
  const people = new Map<string, { id: Id; username: string; ctx: RequestContext }>();
  const products = new Map<string, Id>();
  const modifiers = new Map<string, Id>();
  const ingredients = new Map<string, Id>();
  const tables = new Map<string, Id>();
  const counters = new Map<string, Id>();
  /** Chaves de envio por nome ("k1") — precisam ser UUID. */
  const keys = new Map<string, string>();
  /** Autorização do gerente guardada no "aparelho" de cada pessoa. */
  const grants = new Map<string, string>();
  /** Conta de cada mesa antes de juntar (para conferir a conta mesclada). */
  const previousOrders = new Map<string, Id>();
  let failure: unknown = null;
  let lastSend: Jsonified<SendResult> | null = null;
  /** Itens pendentes que a tela mostrava (cenário do outro garçom). */
  let screenItems: Id[] = [];

  const storeId = (name: StoreName) => (name === 'Centro' ? org.centro : org.praia);
  function get<T>(map: Map<string, T>, name: string, what: string): T {
    const value = map.get(name);
    if (value === undefined) throw new Error(`${what} "${name}" não existe no cenário`);
    return value;
  }
  const person = (name: string) => get(people, name, 'pessoa');
  const ctx = (name: string) => person(name).ctx;
  const admin = () => ctx('sistema');

  async function addPerson(
    name: string,
    role: SystemRole,
    scope: { store: StoreName } | 'organization',
    pin?: string,
  ) {
    const username = uniqueUsername(name.normalize('NFD').replace(/\p{M}/gu, ''));
    const id = await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Senha@2026',
      ...(pin ? { pin } : {}),
      ...(scope === 'organization'
        ? { organizationRole: role }
        : { storeRoles: [{ role, storeId: storeId(scope.store) }] }),
    });
    const { ctx: context } = await loginAs(services, username, 'Senha@2026');
    people.set(name, { id, username, ctx: context });
  }

  async function orderOfTable(table: string): Promise<Id> {
    const [row] = await db
      .select({ orderId: diningTable.currentOrderId })
      .from(diningTable)
      .where(eq(diningTable.id, get(tables, table, 'mesa')));
    if (!row?.orderId) throw new Error(`a mesa ${table} não tem conta aberta`);
    return row.orderId;
  }

  const w = {
    services,
    db,
    get org() {
      return org;
    },
    get failure() {
      return failure;
    },
    get lastSend() {
      return lastSend;
    },
    storeId,
    ctx,
    userId: (name: string) => person(name).id,
    username: (name: string) => person(name).username,
    table: (name: string) => get(tables, name, 'mesa'),
    product: (name: string) => get(products, name, 'produto'),
    orderOfTable,
    counter: (label: string) => get(counters, label, 'balcão'),

    async newOrganization() {
      for (const map of [
        people,
        products,
        modifiers,
        ingredients,
        tables,
        counters,
        keys,
        grants,
      ]) {
        map.clear();
      }
      previousOrders.clear();
      failure = null;
      lastSend = null;
      screenItems = [];
      org = await createTestOrganization(db);
      await addPerson('sistema', 'ADMIN', 'organization');
    },
    async person(name: string, role: SystemRole, pin?: string) {
      await addPerson(name, role, { store: 'Centro' }, pin);
    },
    async personAt(name: string, role: SystemRole, storeName: StoreName) {
      await addPerson(name, role, { store: storeName });
    },
    /** Primeiro passo do cenário: organização nova + a primeira pessoa. */
    async first(name: string, role: SystemRole, pin?: string) {
      await w.newOrganization();
      await w.person(name, role, pin);
    },

    async attempt(work: () => Promise<unknown>) {
      failure = null;
      try {
        await work();
      } catch (error) {
        failure = error;
      }
    },
    expectFailure(code: string) {
      expect(failure).toMatchObject({ code });
    },

    // ---- Cardápio e estoque ----

    async sells(
      name: string,
      price: string,
      options: { modifier?: [string, string]; noPrep?: boolean } = {},
    ) {
      const context = admin();
      const categories = await services.catalog.listCategories(context);
      const categoryId =
        categories[0]?.id ??
        (await services.catalog.createCategory(context, { name: 'Lanches' })).id;
      const groupIds: Id[] = [];
      if (options.modifier) {
        const [modifierName, modifierPrice] = options.modifier;
        const { id: groupId } = await services.catalog.createModifierGroup(context, {
          name: `Extras de ${name}`,
          minSelect: 0,
          maxSelect: 3,
        });
        const { id } = await services.catalog.createModifier(context, {
          groupId,
          name: modifierName,
          priceDeltaCents: cents(modifierPrice),
        });
        modifiers.set(modifierName, id);
        groupIds.push(groupId);
      }
      const { id } = await services.catalog.createProduct(context, {
        name,
        categoryId,
        sku: null,
        description: null,
        requiresPreparation: !options.noPrep,
        modifierGroupIds: groupIds,
        priceHereCents: cents(price),
      });
      products.set(name, id);
    },

    async recipe(kind: 'PRODUCT' | 'MODIFIER', owner: string, grams: string, ingredient: string) {
      if (!ingredients.has(ingredient)) {
        const { id } = await services.inventory.createIngredient(admin(), {
          name: ingredient,
          baseUnit: 'g',
        });
        ingredients.set(ingredient, id);
      }
      await services.recipes.saveRecipe(admin(), {
        kind,
        id: kind === 'PRODUCT' ? w.product(owner) : get(modifiers, owner, 'adicional'),
        version: null,
        lines: [{ ingredientId: get(ingredients, ingredient, 'insumo'), quantity: grams }],
      });
    },

    /** Compra de 1 kg por R$ 40,00 (custo de 4 centavos por grama). */
    async stockOf(ingredient: string, kilos: string) {
      await services.inventory.registerEntry(admin(), {
        ingredientId: get(ingredients, ingredient, 'insumo'),
        quantity: kilos,
        unit: 'kg',
        paid: '40,00',
      });
    },

    async expectBalance(ingredient: string, balance: string) {
      const found = await services.inventory.getIngredient(
        admin(),
        get(ingredients, ingredient, 'insumo'),
      );
      expect(quantityText(found.quantity)).toBe(balance);
    },

    async losses() {
      return runInTransaction(db, (tx) =>
        lossesValue(tx, { storeId: org.centro, from: TODAY, to: TODAY }),
      );
    },

    async blockNegative() {
      await db
        .update(store)
        .set({ negativeStockPolicy: 'BLOQUEAR' })
        .where(eq(store.id, org.centro));
    },

    async setPrice(product: string, price: string) {
      await db
        .update(productStore)
        .set({ priceCents: cents(price) })
        .where(
          and(eq(productStore.productId, w.product(product)), eq(productStore.storeId, org.centro)),
        );
    },

    // ---- Mesas e contas ----

    async createTable(
      number: string,
      by = 'sistema',
      extra: { area?: string; seats?: number } = {},
    ) {
      const { id } = await services.tables.createTable(ctx(by), {
        number,
        area: extra.area ?? null,
        seats: extra.seats ?? 4,
      });
      tables.set(number, id);
    },

    async forceTableStatus(number: string, status: 'LIMPEZA') {
      await db
        .update(diningTable)
        .set({ status, currentOrderId: null })
        .where(eq(diningTable.id, w.table(number)));
    },

    async open(by: string, table: string, guests?: number) {
      await services.orders.openTable(ctx(by), { tableId: w.table(table), guests: guests ?? null });
    },

    async openCounter(by: string, label: string) {
      const { orderId } = await services.orders.openCounter(ctx(by), { label });
      counters.set(label, orderId);
    },

    async add(
      by: string,
      target: { table: string } | { counter: string },
      quantity: number,
      product: string,
      options: { modifier?: string; notes?: string } = {},
    ) {
      const orderId =
        'table' in target ? await orderOfTable(target.table) : w.counter(target.counter);
      await services.orders.addItem(ctx(by), {
        orderId,
        productId: w.product(product),
        quantity,
        modifierIds: options.modifier ? [get(modifiers, options.modifier, 'adicional')] : [],
        notes: options.notes ?? null,
      });
    },

    async order(table: string) {
      return services.orders.getOrder(admin(), await orderOfTable(table));
    },

    async pendingIds(table: string) {
      return (await w.order(table)).pending.map((item) => item.id);
    },

    /** Itens enviados, do mais antigo para o mais novo. */
    async sentItems(table: string) {
      const detail = await w.order(table);
      return [...detail.rounds].reverse().flatMap((round) => round.items);
    },

    async sentItem(table: string, position: number) {
      const item = (await w.sentItems(table))[position];
      if (!item) throw new Error(`a mesa ${table} não tem o item ${String(position + 1)}`);
      return item;
    },

    async send(by: string, table: string, keyName?: string) {
      let key = keyName ? keys.get(keyName) : undefined;
      if (!key) {
        key = newId();
        if (keyName) keys.set(keyName, key);
      }
      lastSend = await services.orders.sendRound(ctx(by), {
        orderId: await orderOfTable(table),
        itemIds: await w.pendingIds(table),
        idempotencyKey: key,
      });
    },

    async rememberScreen(table: string) {
      screenItems = await w.pendingIds(table);
    },

    /** Envia os itens que a tela mostrava (reenvio usa a mesma chave). */
    async sendScreen(by: string, table: string, keyName?: string) {
      lastSend = await services.orders.sendRound(ctx(by), {
        orderId: await orderOfTable(table),
        itemIds: screenItems,
        idempotencyKey: (keyName ? keys.get(keyName) : undefined) ?? newId(),
      });
    },

    async authorize(manager: string, device: string, pin: string) {
      const { grantToken } = await services.auth.requestElevation(ctx(device), {
        authorizerUsername: person(manager).username,
        pin,
        permission: 'orders.cancel',
      });
      grants.set(device, grantToken);
    },

    async cancel(by: string, table: string, position: number, reason: string) {
      const item = await w.sentItem(table, position);
      await services.orders.cancelItem(ctx(by), {
        itemId: item.id,
        reason,
        grantToken: grants.get(by) ?? null,
      });
    },

    async startPreparing(table: string, position: number) {
      const item = await w.sentItem(table, position);
      await db.update(orderItem).set({ status: 'EM_PREPARO' }).where(eq(orderItem.id, item.id));
    },

    async version(table: string) {
      return (await w.order(table)).version;
    },

    async join(by: string, table: string, into: string) {
      const [row] = await db
        .select({ orderId: diningTable.currentOrderId })
        .from(diningTable)
        .where(eq(diningTable.id, w.table(table)));
      if (row?.orderId) previousOrders.set(table, row.orderId);
      const orderId = await orderOfTable(into);
      await services.orders.join(ctx(by), {
        orderId,
        version: await w.version(into),
        tableId: w.table(table),
      });
    },

    previousOrder: (table: string) => get(previousOrders, table, 'conta anterior'),

    async floorStatus(table: string) {
      const { tables: rows } = await services.orders.floor(admin());
      return rows.find((row) => row.id === w.table(table))?.status;
    },

    async newTickets() {
      const rows = await db
        .select({ id: kitchenTicket.id })
        .from(kitchenTicket)
        .where(and(eq(kitchenTicket.storeId, org.centro), eq(kitchenTicket.status, 'NOVO')));
      return rows.length;
    },

    async orderRow(orderId: Id) {
      const [row] = await db.select().from(customerOrder).where(eq(customerOrder.id, orderId));
      return row;
    },

    async expectAudit(event: string, by: string, authorizer?: string) {
      const rows = await db
        .select({ authorizer: auditLog.authorizerUserId })
        .from(auditLog)
        .where(and(eq(auditLog.event, event), eq(auditLog.actorUserId, w.userId(by))));
      expect(rows.length).toBeGreaterThan(0);
      if (authorizer) {
        expect(rows.map((row) => row.authorizer)).toContain(w.userId(authorizer));
      }
    },
  };
  return w;
}

export type FloorWorld = ReturnType<typeof floorWorld>;
