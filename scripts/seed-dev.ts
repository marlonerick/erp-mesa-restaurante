// Dados FICTÍCIOS para desenvolvimento e testes E2E (regra inviolável 8 do README).
// Monta o cenário do piloto: 1 loja principal (Centro) + 1 loja extra (Praia) para ver o
// isolamento, e os perfis da equipe (só com o banco vazio) + o cardápio de demonstração (só se a
// empresa ainda não tiver categorias). Pode rodar de novo sem duplicar nada.
// Uso: npm run db:seed
import { and, asc, eq } from 'drizzle-orm';
import { grantStoreRoleUnchecked } from '@/modules/authorization';
import { addStore, getStore } from '@/modules/organizations';
import {
  bootstrapFirstAdmin,
  countUsers,
  findUserByUsername,
  insertUser,
  storePinHash,
} from '@/modules/users';
import { getDatabase } from '@/shared/db/client';
import { store, store as storeTable } from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
import { newId, type SystemRole } from '@/shared/kernel';
import { argon2Hasher } from '@/shared/security/password-hasher';
import { seedDemoCatalog } from './lib/demo-catalog';
import { seedDemoStock } from './lib/demo-stock';
import { seedDemoTables } from './lib/demo-tables';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
  console.error('O seed de desenvolvimento nunca roda em produção.');
  process.exit(1);
}

const TEAM: readonly {
  name: string;
  username: string;
  password: string;
  pin: string;
  role: SystemRole;
  store: 'centro' | 'praia';
}[] = [
  {
    name: 'Carla Gerente',
    username: 'gerente',
    password: 'Gerente@2026',
    pin: '739104',
    role: 'GERENTE',
    store: 'centro',
  },
  {
    name: 'Bia Caixa',
    username: 'caixa',
    password: 'Caixa@2026',
    pin: '551208',
    role: 'CAIXA',
    store: 'centro',
  },
  {
    name: 'João Garçom',
    username: 'joao',
    password: 'Garcom@2026',
    pin: '305917',
    role: 'GARCOM',
    store: 'centro',
  },
  {
    name: 'Ana Garçom',
    username: 'ana',
    password: 'Garcom@2026',
    pin: '482915',
    role: 'GARCOM',
    store: 'centro',
  },
  {
    name: 'Téo Cozinha',
    username: 'cozinha',
    password: 'Cozinha@2026',
    pin: '624081',
    role: 'COZINHA',
    store: 'centro',
  },
  {
    name: 'Rui Garçom (Praia)',
    username: 'rui',
    password: 'Garcom@2026',
    pin: '270593',
    role: 'GARCOM',
    store: 'praia',
  },
];

const { db, close } = getDatabase();
try {
  if ((await runInTransaction(db, (tx) => countUsers(tx))) > 0) {
    console.info('Banco já tem usuários: seed ignorado.');
  } else {
    const { organizationId, storeId: centro } = await bootstrapFirstAdmin({
      organizationName: 'Restaurante Exemplo',
      companyLegalName: 'Restaurante Exemplo Ltda (fictício)',
      companyTradeName: 'Restaurante Exemplo',
      cnpj: null,
      storeName: 'Centro',
      storeCode: 'CENTRO',
      adminName: 'Dona Admin',
      adminUsername: 'admin',
      adminPassword: 'Admin@2026',
    });

    const hashed = await Promise.all(
      TEAM.map(async (member) => ({
        ...member,
        passwordHash: await argon2Hasher.hash(member.password),
        pinHash: await argon2Hasher.hash(member.pin),
      })),
    );

    await runInTransaction(db, async (tx) => {
      const store = await getStore(tx, centro);
      if (!store) throw new Error('loja Centro não encontrada');
      const { companyId } = store;
      const praia = await addStore(tx, { organizationId, companyId, name: 'Praia', code: 'PRAIA' });
      // Vários caixas abertos ao mesmo tempo (Q-05): o Centro de demonstração aceita 5 — os testes
      // de navegador abrem um caixa por aparelho simulado, em paralelo
      await tx.update(storeTable).set({ maxOpenCashSessions: 5 }).where(eq(storeTable.id, centro));
      for (const member of hashed) {
        const id = newId();
        await insertUser(tx, {
          id,
          organizationId,
          name: member.name,
          username: member.username,
          passwordHash: member.passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          createdBy: null,
        });
        await storePinHash(tx, id, member.pinHash);
        await grantStoreRoleUnchecked(tx, {
          userId: id,
          roleCode: member.role,
          storeId: member.store === 'centro' ? centro : praia,
        });
      }
    });

    console.info('\nSeed criado (dados FICTÍCIOS). Usuários:');
    console.table([
      { usuario: 'admin', senha: 'Admin@2026', pin: '-', perfil: 'ADMIN (organização)' },
      ...TEAM.map((m) => ({
        usuario: m.username,
        senha: m.password,
        pin: m.pin,
        perfil: `${m.role} (${m.store})`,
      })),
    ]);
  }

  // Cardápio (Etapa 4), estoque (Etapa 5) e mesas (Etapa 6) de demonstração: rodam também em
  // bancos antigos
  const created = await runInTransaction(db, async (tx) => {
    const [centro] = await tx
      .select({ id: store.id, companyId: store.companyId })
      .from(store)
      .where(eq(store.code, 'CENTRO'))
      .orderBy(asc(store.createdAt))
      .limit(1);
    if (!centro) return { catalog: false, stock: false, tables: false };
    const [praia] = await tx
      .select({ id: store.id })
      .from(store)
      .where(and(eq(store.companyId, centro.companyId), eq(store.code, 'PRAIA')));
    const admin = await findUserByUsername(tx, 'admin');
    if (!praia || !admin) return { catalog: false, stock: false, tables: false };
    const catalog = await seedDemoCatalog(tx, {
      companyId: centro.companyId,
      centro: centro.id,
      praia: praia.id,
    });
    const stock = await seedDemoStock(tx, {
      companyId: centro.companyId,
      stores: [centro.id, praia.id],
      userId: admin.id,
    });
    const tables = await seedDemoTables(tx, {
      centro: centro.id,
      praia: praia.id,
      userId: admin.id,
    });
    return { catalog, stock, tables };
  });
  console.info(
    created.catalog
      ? 'Cardápio de demonstração criado (X-Burger, Parmegiana, bebidas...).'
      : 'Cardápio já existe: ignorado.',
  );
  console.info(
    created.stock
      ? 'Estoque e fichas técnicas de demonstração criados (compra inicial no Centro e na Praia).'
      : 'Estoque já existe: ignorado.',
  );
  console.info(
    created.tables
      ? 'Mesas de demonstração criadas (12 no Centro, 8 na Praia; mesa 2 do Centro com conta aberta).'
      : 'Mesas já existem: ignorado.',
  );
} finally {
  await close();
}
