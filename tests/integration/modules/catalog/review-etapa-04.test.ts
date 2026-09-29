// Achados da revisão da Etapa 4 (docs/weeks/etapa-04.md): cada teste reproduz um cenário.
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CatalogService } from '@/modules/catalog';
import { category } from '@/shared/db/schema';
import { type Id, PERMISSIONS, type RequestContext } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  uniqueUsername,
} from '../../../support/identity';
import { FakeRequestContext } from '../../../support/request-context';
import { catalogWorld } from './catalog-world';

const { db } = useTestDatabase();
const w = catalogWorld(db);

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'OK',
    (error: unknown) => (error as { code?: string }).code ?? String(error),
  );

interface Targets {
  readonly product: Id;
  readonly category: Id;
  readonly group: Id;
  readonly modifier: Id;
  readonly centro: Id;
}

let targets: Targets;

beforeEach(async () => {
  await w.manager('carla');
  await w.createCategory('Lanches');
  await w.createProduct('sistema', { name: 'X-Burger', category: 'Lanches', price: '32,00' });
  await w.createGroup('carla', 'Extras', 0, 3);
  const bacon = await w.catalog.createModifier(w.ctx('carla'), {
    groupId: w.group('Extras'),
    name: 'Bacon',
    priceDeltaCents: 500,
  });
  targets = {
    product: w.product('X-Burger'),
    category: w.category('Lanches'),
    group: w.group('Extras'),
    modifier: bacon.id,
    centro: w.org.centro,
  };
});

/** Gerente de OUTRA organização (com todas as permissões do catálogo na loja dela). */
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

/** Administradora da MESMA organização, trabalhando numa loja de OUTRA empresa. */
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

/** Cada caso de uso que recebe um id, com o erro esperado de quem está fora do escopo. */
const attacks: readonly [
  string,
  string,
  (c: CatalogService, x: RequestContext) => Promise<unknown>,
][] = [
  ['getProduct', 'PRODUCT_NOT_FOUND', (c, x) => c.getProduct(x, targets.product)],
  [
    'updateProduct',
    'PRODUCT_NOT_FOUND',
    (c, x) =>
      c.updateProduct(x, {
        productId: targets.product,
        version: 0,
        name: 'Invadido',
        categoryId: targets.category,
        sku: null,
        description: null,
        requiresPreparation: true,
        modifierGroupIds: [],
      }),
  ],
  [
    'setProductStatus',
    'PRODUCT_NOT_FOUND',
    (c, x) => c.setProductStatus(x, { productId: targets.product, version: 0, active: false }),
  ],
  [
    'removeFromStore',
    'PRODUCT_NOT_FOUND',
    (c, x) =>
      c.removeFromStore(x, { productId: targets.product, storeId: targets.centro, version: 0 }),
  ],
  [
    'setAvailability',
    'PRODUCT_NOT_FOUND',
    (c, x) => c.setAvailability(x, { productId: targets.product, available: false }),
  ],
  [
    'createProduct com categoria alheia',
    'CATEGORY_NOT_FOUND',
    (c, x) =>
      c.createProduct(x, {
        name: 'Invasor',
        categoryId: targets.category,
        sku: null,
        description: null,
        requiresPreparation: true,
        modifierGroupIds: [],
        priceHereCents: null,
      }),
  ],
  ['getCategory', 'CATEGORY_NOT_FOUND', (c, x) => c.getCategory(x, targets.category)],
  [
    'updateCategory',
    'CATEGORY_NOT_FOUND',
    (c, x) =>
      c.updateCategory(x, { categoryId: targets.category, version: 0, name: 'X1', active: true }),
  ],
  [
    'moveCategory',
    'CATEGORY_NOT_FOUND',
    (c, x) => c.moveCategory(x, { categoryId: targets.category, direction: 'UP' }),
  ],
  ['getModifierGroup', 'MODIFIER_GROUP_NOT_FOUND', (c, x) => c.getModifierGroup(x, targets.group)],
  [
    'updateModifierGroup',
    'MODIFIER_GROUP_NOT_FOUND',
    (c, x) =>
      c.updateModifierGroup(x, {
        groupId: targets.group,
        version: 0,
        name: 'Invadido',
        minSelect: 0,
        maxSelect: 1,
        active: true,
      }),
  ],
  [
    'createModifier',
    'MODIFIER_GROUP_NOT_FOUND',
    (c, x) => c.createModifier(x, { groupId: targets.group, name: 'Veneno', priceDeltaCents: 0 }),
  ],
  [
    'updateModifier',
    'MODIFIER_NOT_FOUND',
    (c, x) =>
      c.updateModifier(x, {
        modifierId: targets.modifier,
        version: 0,
        name: 'Veneno',
        priceDeltaCents: 1,
        active: true,
      }),
  ],
];

describe('I-3: isolamento em TODOS os casos de uso (IDOR/BOLA — README B.8)', () => {
  it.each(attacks)('outra organização: %s → %s', async (_label, code, attack) => {
    expect(await codeOf(attack(w.catalog, await otherOrganization()))).toBe(code);
  });

  it.each(attacks)('outra empresa da mesma organização: %s → %s', async (_label, code, attack) => {
    expect(await codeOf(attack(w.catalog, await otherCompany()))).toBe(code);
  });

  it('nada foi alterado pelas tentativas', async () => {
    for (const [, , attack] of attacks) await codeOf(attack(w.catalog, await otherOrganization()));
    const product = await w.catalog.getProduct(w.ctx('carla'), targets.product);
    expect(product).toMatchObject({ name: 'X-Burger', active: true, version: 0 });
    const group = await w.catalog.getModifierGroup(w.ctx('carla'), targets.group);
    expect(group.modifiers).toEqual([expect.objectContaining({ name: 'Bacon', version: 0 })]);
    await w.expectOnMenu('Centro', 'X-Burger', 3200);
  });

  it('gerente do Centro não tira o produto da Praia', async () => {
    await w.addPerson('dona', 'ADMIN', 'organization');
    await w.setPrice('dona', 'X-Burger', 'Praia', '35,00');
    expect(
      await codeOf(
        w.catalog.removeFromStore(w.ctx('carla'), {
          productId: targets.product,
          storeId: w.storeId('Praia'),
          version: 0,
        }),
      ),
    ).toBe('FORBIDDEN');
    await w.expectOnMenu('Praia', 'X-Burger', 3500);
  });
});

describe('I-1: subir/descer com empate na posição', () => {
  it('renumera a lista e respeita a ordem que a pessoa via', async () => {
    await w.createCategory('Bebidas');
    await w.createCategory('Sobremesas');
    // Empate como o de dois cadastros simultâneos: Bebidas(0), Lanches(0), Sobremesas(1)
    const setOrder = (name: string, sortOrder: number) =>
      db
        .update(category)
        .set({ sortOrder })
        .where(eq(category.id, w.category(name)));
    await setOrder('Bebidas', 0);
    await setOrder('Lanches', 0);
    await setOrder('Sobremesas', 1);
    const names = async () =>
      (await w.catalog.listCategories(w.ctx('carla'))).map((item) => item.name);
    expect(await names()).toEqual(['Bebidas', 'Lanches', 'Sobremesas']);

    await w.catalog.moveCategory(w.ctx('carla'), {
      categoryId: w.category('Lanches'),
      direction: 'UP',
    });
    expect(await names()).toEqual(['Lanches', 'Bebidas', 'Sobremesas']);
    const orders = (await w.catalog.listCategories(w.ctx('carla'))).map((item) => item.sortOrder);
    expect(orders).toEqual([0, 1, 2]);
  });
});

describe('S-1: disponibilidade só para o que está no cardápio', () => {
  it('produto desativado (aba antiga) recebe o aviso e nada é gravado', async () => {
    await w.catalog.setProductStatus(w.ctx('carla'), {
      productId: targets.product,
      version: 0,
      active: false,
    });
    expect(
      await codeOf(
        w.catalog.setAvailability(w.ctx('carla'), { productId: targets.product, available: false }),
      ),
    ).toBe('PRODUCT_NOT_ON_MENU');
  });

  it('produto de categoria desativada também', async () => {
    await w.catalog.updateCategory(w.ctx('carla'), {
      categoryId: targets.category,
      version: 0,
      name: 'Lanches',
      active: false,
    });
    expect(
      await codeOf(
        w.catalog.setAvailability(w.ctx('carla'), { productId: targets.product, available: false }),
      ),
    ).toBe('PRODUCT_NOT_ON_MENU');
  });

  it('devolve o nome lido do banco para a mensagem da tela (S-3)', async () => {
    expect(
      await w.catalog.setAvailability(w.ctx('carla'), {
        productId: targets.product,
        available: false,
      }),
    ).toEqual({ name: 'X-Burger' });
  });
});

describe('S-5: nome repetido não diferencia acentos', () => {
  it('"Café" e "Cafe" são o mesmo nome', async () => {
    await w.catalog.createCategory(w.ctx('carla'), { name: 'Café' });
    expect(await codeOf(w.catalog.createCategory(w.ctx('carla'), { name: 'Cafe' }))).toBe(
      'CATEGORY_NAME_TAKEN',
    );
  });
});
