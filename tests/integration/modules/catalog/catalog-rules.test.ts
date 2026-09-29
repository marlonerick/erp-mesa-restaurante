import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog, category } from '@/shared/db/schema';
import { type Id, PERMISSIONS } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import { FakeRequestContext } from '../../../support/request-context';
import { catalogWorld, cents } from './catalog-world';

const { db } = useTestDatabase();
const w = catalogWorld(db);

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'OK',
    (error: unknown) => (error as { code?: string }).code ?? String(error),
  );

async function auditRows(event: string, entityId: Id) {
  return db
    .select({
      storeId: auditLog.storeId,
      before: auditLog.beforeData,
      after: auditLog.afterData,
    })
    .from(auditLog)
    .where(and(eq(auditLog.event, event), eq(auditLog.entityId, entityId)));
}

beforeEach(async () => {
  await w.manager('carla');
  await w.createCategory('Lanches');
  await w.createProduct('sistema', { name: 'X-Burger', category: 'Lanches', price: '32,00' });
});

describe('isolamento (RN-CAT-01, ADR-0009)', () => {
  it('outra organização não vê nem altera o catálogo', async () => {
    const mine = { product: w.product('X-Burger'), category: w.category('Lanches') };
    const myOrg = w.org;
    await w.manager('intrusa'); // organização nova
    const intrusa = w.ctx('intrusa');
    expect(await codeOf(w.catalog.getProduct(intrusa, mine.product))).toBe('PRODUCT_NOT_FOUND');
    expect(
      await codeOf(
        w.catalog.updateCategory(intrusa, {
          categoryId: mine.category,
          version: 0,
          name: 'Invadida',
          active: true,
        }),
      ),
    ).toBe('CATEGORY_NOT_FOUND');
    expect(
      await codeOf(
        w.catalog.setAvailability(intrusa, { productId: mine.product, available: false }),
      ),
    ).toBe('PRODUCT_NOT_FOUND');
    expect(
      await codeOf(
        w.catalog.setStorePrice(intrusa, {
          productId: mine.product,
          storeId: myOrg.centro,
          priceCents: 1,
          version: null,
        }),
      ),
    ).toBe('PRODUCT_NOT_FOUND');
    expect(await w.catalog.listProducts(intrusa)).toEqual([]);
  });

  it('outra empresa da MESMA organização tem catálogo próprio', async () => {
    // Empresa B com a loja "Norte", criada pela administradora da organização
    const admin = w.ctx('sistema');
    const { id: companyB } = await w.services.organizations.createCompany(admin, {
      legalName: 'Filial B Ltda',
      tradeName: 'Filial B',
      cnpj: null,
    });
    const { id: norte } = await w.services.organizations.createStore(admin, {
      companyId: companyB,
      name: 'Norte',
      code: 'NORTE',
    });
    const inNorte = new FakeRequestContext({
      userId: w.userId('sistema'),
      organizationId: w.org.organizationId,
      storeId: norte,
      permissions: [...PERMISSIONS],
    });

    expect(await w.catalog.listProducts(inNorte)).toEqual([]);
    expect(await codeOf(w.catalog.getProduct(inNorte, w.product('X-Burger')))).toBe(
      'PRODUCT_NOT_FOUND',
    );
    // Na loja da empresa A, não dá para pôr preço na loja da empresa B
    expect(
      await codeOf(
        w.catalog.setStorePrice(admin, {
          productId: w.product('X-Burger'),
          storeId: norte,
          priceCents: 100,
          version: null,
        }),
      ),
    ).toBe('STORE_NOT_FOUND');
    // Mesmo nome é permitido em outra empresa
    await expect(w.catalog.createCategory(inNorte, { name: 'Lanches' })).resolves.toBeDefined();
  });

  it('não liga ao produto um grupo de adicionais de outra organização', async () => {
    const myCtx = w.ctx('carla');
    const myCategory = w.category('Lanches');
    await w.manager('outra');
    await w.createGroup('outra', 'Molhos', 0, 2);
    const foreignGroup = w.group('Molhos');
    expect(
      await codeOf(
        w.catalog.createProduct(myCtx, {
          name: 'X-Salada',
          categoryId: myCategory,
          sku: null,
          description: null,
          requiresPreparation: true,
          modifierGroupIds: [foreignGroup],
          priceHereCents: null,
        }),
      ),
    ).toBe('MODIFIER_GROUP_NOT_FOUND');
  });
});

describe('cadastro (RN-CAT-02, RN-CAT-04)', () => {
  it('nome de categoria repetido não diferencia maiúsculas nem acentos', async () => {
    expect(await codeOf(w.catalog.createCategory(w.ctx('carla'), { name: 'LANCHES' }))).toBe(
      'CATEGORY_NAME_TAKEN',
    );
  });

  it('código (SKU) repetido na empresa é recusado com a mensagem certa', async () => {
    const input = {
      categoryId: w.category('Lanches'),
      description: null,
      requiresPreparation: false,
      modifierGroupIds: [],
      priceHereCents: null,
    };
    await w.catalog.createProduct(w.ctx('carla'), { ...input, name: 'Coca lata', sku: 'coca-350' });
    expect(
      await codeOf(
        w.catalog.createProduct(w.ctx('carla'), { ...input, name: 'Coca 2', sku: 'COCA-350' }),
      ),
    ).toBe('SKU_TAKEN');
  });

  it('salvar sem mudança não grava versão nem auditoria; só os adicionais mudarem já conta', async () => {
    const ctx = w.ctx('carla');
    await w.createGroup('carla', 'Ponto da carne', 1, 1);
    const before = await w.catalog.getProduct(ctx, w.product('X-Burger'));
    const same = {
      productId: before.id,
      version: before.version,
      name: before.name,
      categoryId: before.categoryId,
      sku: before.sku,
      description: before.description,
      requiresPreparation: before.requiresPreparation,
      modifierGroupIds: [],
    };
    await w.catalog.updateProduct(ctx, same);
    expect((await w.catalog.getProduct(ctx, before.id)).version).toBe(before.version);
    expect(await auditRows('PRODUCT_UPDATED', before.id)).toEqual([]);

    await w.catalog.updateProduct(ctx, { ...same, modifierGroupIds: [w.group('Ponto da carne')] });
    const after = await w.catalog.getProduct(ctx, before.id);
    expect(after.version).toBe(before.version + 1);
    expect(after.modifierGroupIds).toEqual([w.group('Ponto da carne')]);
    const [audit] = await auditRows('PRODUCT_UPDATED', before.id);
    expect(audit).toMatchObject({
      storeId: null,
      before: { modifierGroupIds: [] },
      after: { modifierGroupIds: [w.group('Ponto da carne')] },
    });
  });

  it('busca trata % e _ como texto, não como curinga', async () => {
    await w.createProduct('carla', { name: 'Suco 100% laranja', category: 'Lanches' });
    const found = await w.catalog.listProducts(w.ctx('carla'), { search: '100%' });
    expect(found.map((row) => row.name)).toEqual(['Suco 100% laranja']);
    expect(await w.catalog.listProducts(w.ctx('carla'), { search: '_' })).toEqual([]);
  });
});

describe('preço por loja (RN-CAT-07)', () => {
  it('auditoria do preço grava a loja afetada; remover tira do cardápio', async () => {
    await w.addPerson('dona', 'ADMIN', 'organization');
    await w.setPrice('dona', 'X-Burger', 'Praia', '35,00');
    const [created] = await auditRows('PRODUCT_PRICE_SET', w.product('X-Burger')).then((rows) =>
      rows.filter((row) => row.storeId === w.storeId('Praia')),
    );
    expect(created).toMatchObject({ after: { priceCents: 3500 } });

    const view = await w.catalog.getProduct(w.ctx('dona'), w.product('X-Burger'));
    const praia = view.prices.find((item) => item.storeId === w.storeId('Praia'))?.price;
    await w.catalog.removeFromStore(w.ctx('dona'), {
      productId: w.product('X-Burger'),
      storeId: w.storeId('Praia'),
      version: praia?.version ?? -1,
    });
    await w.expectNotOnMenu('Praia', 'X-Burger');
    await w.expectOnMenu('Centro', 'X-Burger', 3200);
    expect(await auditRows('PRODUCT_REMOVED_FROM_STORE', w.product('X-Burger'))).toEqual([
      expect.objectContaining({ storeId: w.storeId('Praia') }),
    ]);
  });

  it('gerente só vê na tela as lojas em que pode mudar o preço', async () => {
    const view = await w.catalog.getProduct(w.ctx('carla'), w.product('X-Burger'));
    expect(view.prices.map((item) => item.storeName)).toEqual(['Centro']);
  });

  it('dois cadastros simultâneos do primeiro preço: um vence, o outro é avisado', async () => {
    await w.addPerson('dona', 'ADMIN', 'organization');
    for (let round = 0; round < 5; round += 1) {
      const name = `Suco ${String(round)}`;
      await w.createProduct('sistema', { name, category: 'Lanches' });
      const save = (price: string) =>
        w.catalog.setStorePrice(w.ctx('dona'), {
          productId: w.product(name),
          storeId: w.storeId('Praia'),
          priceCents: cents(price),
          version: null, // as duas telas mostravam "não vende nesta loja"
        });
      const results = await Promise.all([codeOf(save('10,00')), codeOf(save('11,00'))]);
      expect(results.sort()).toEqual(['CONCURRENT_MODIFICATION', 'OK']);
    }
  });

  it('"acabou" não muda a versão do preço: quem está editando o preço salva normalmente', async () => {
    await w.addPerson('teo', 'COZINHA', { store: 'Centro' });
    const view = await w.catalog.getProduct(w.ctx('carla'), w.product('X-Burger'));
    const shown = view.prices[0]?.price?.version ?? -1;
    await w.catalog.setAvailability(w.ctx('teo'), {
      productId: w.product('X-Burger'),
      available: false,
    });
    await w.catalog.setStorePrice(w.ctx('carla'), {
      productId: w.product('X-Burger'),
      storeId: w.storeId('Centro'),
      priceCents: 3300,
      version: shown,
    });
    const after = await w.catalog.getProduct(w.ctx('carla'), w.product('X-Burger'));
    expect(after.prices[0]?.price).toMatchObject({ priceCents: 3300, available: false });
  });
});

describe('disponibilidade (RN-CAT-09)', () => {
  it('produto não vendido na loja não pode ser marcado', async () => {
    await w.addPerson('rui', 'COZINHA', { store: 'Praia' });
    expect(
      await codeOf(
        w.catalog.setAvailability(w.ctx('rui'), {
          productId: w.product('X-Burger'),
          available: false,
        }),
      ),
    ).toBe('PRODUCT_NOT_ON_MENU');
  });

  it('marcar "acabou" duas vezes audita uma vez só', async () => {
    const mark = () =>
      w.catalog.setAvailability(w.ctx('carla'), {
        productId: w.product('X-Burger'),
        available: false,
      });
    await mark();
    await mark();
    expect(await auditRows('PRODUCT_AVAILABILITY_CHANGED', w.product('X-Burger'))).toHaveLength(1);
    const list = await w.catalog.listAvailability(w.ctx('carla'));
    expect(list[0]?.products[0]).toMatchObject({ name: 'X-Burger', available: false });
  });
});

describe('ordem das categorias', () => {
  it('cliques simultâneos em subir/descer nunca repetem nem perdem posição', async () => {
    for (const name of ['Bebidas', 'Sobremesas', 'Porções']) await w.createCategory(name);
    const ids = ['Lanches', 'Bebidas', 'Sobremesas', 'Porções'].map((name) => w.category(name));
    await Promise.all(
      ids.flatMap((categoryId) => [
        w.catalog.moveCategory(w.ctx('carla'), { categoryId, direction: 'UP' }),
        w.catalog.moveCategory(w.ctx('carla'), { categoryId, direction: 'DOWN' }),
      ]),
    );
    const rows = await db
      .select({ sortOrder: category.sortOrder })
      .from(category)
      .where(eq(category.companyId, w.org.companyId));
    expect(rows.map((row) => row.sortOrder).sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('cardápio da loja (RN-CAT-10)', () => {
  it('só mostra grupos e opções ativos', async () => {
    const ctx = w.ctx('carla');
    await w.createGroup('carla', 'Extras', 0, 3);
    await w.createGroup('carla', 'Antigo', 0, 1);
    const bacon = await w.catalog.createModifier(ctx, {
      groupId: w.group('Extras'),
      name: 'Bacon',
      priceDeltaCents: 500,
    });
    const ovo = await w.catalog.createModifier(ctx, {
      groupId: w.group('Extras'),
      name: 'Ovo',
      priceDeltaCents: 300,
    });
    await w.catalog.updateModifier(ctx, {
      modifierId: ovo.id,
      version: 0,
      name: 'Ovo',
      priceDeltaCents: 300,
      active: false,
    });
    await w.catalog.updateModifierGroup(ctx, {
      groupId: w.group('Antigo'),
      version: 0,
      name: 'Antigo',
      minSelect: 0,
      maxSelect: 1,
      active: false,
    });
    const burger = await w.catalog.getProduct(ctx, w.product('X-Burger'));
    await w.catalog.updateProduct(ctx, {
      productId: burger.id,
      version: burger.version,
      name: burger.name,
      categoryId: burger.categoryId,
      sku: null,
      description: null,
      requiresPreparation: true,
      modifierGroupIds: [w.group('Extras'), w.group('Antigo')],
    });
    const item = (await w.menu('Centro')).find((row) => row.name === 'X-Burger');
    expect(item?.modifierGroups).toEqual([
      {
        id: w.group('Extras'),
        name: 'Extras',
        minSelect: 0,
        maxSelect: 3,
        options: [{ id: bacon.id, name: 'Bacon', priceDeltaCents: 500 }],
      },
    ]);
  });

  it('avisa quando o mínimo do grupo não cabe nas opções ativas', async () => {
    await w.createGroup('carla', 'Ponto da carne', 1, 1);
    const group = await w.catalog.getModifierGroup(w.ctx('carla'), w.group('Ponto da carne'));
    expect(group.satisfiable).toBe(false);
  });
});
