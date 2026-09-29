import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { and, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import type { StoreRecord } from '@/modules/organizations';
import { auditLog, kitchenStation } from '@/shared/db/schema';
import type { Id, RequestContext } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  type TestOrganization,
  testServices,
  uniqueUsername,
} from '../../../support/identity';

const feature = await loadFeature('tests/features/organizations/lojas.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  const services = testServices(db);
  let org: TestOrganization;
  let marlon: { id: Id; ctx: RequestContext };
  let failure: unknown = null;
  let createdId: Id | null = null;

  async function attempt(work: () => Promise<unknown>) {
    failure = null;
    try {
      await work();
    } catch (error) {
      failure = error;
    }
  }

  async function marlonIsAdmin() {
    org = await createTestOrganization(db);
    const username = uniqueUsername('marlon');
    const id = await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Admin@2026',
      organizationRole: 'ADMIN',
    });
    marlon = { id, ctx: (await loginAs(services, username, 'Admin@2026')).ctx };
  }

  const centro = () => services.organizations.getStore(marlon.ctx, org.centro);

  async function auditOf(event: string, entityId: Id) {
    return db
      .select({
        actor: auditLog.actorUserId,
        before: auditLog.beforeData,
        after: auditLog.afterData,
      })
      .from(auditLog)
      .where(and(eq(auditLog.event, event), eq(auditLog.entityId, entityId)));
  }

  const withFee = (store: StoreRecord, serviceFeeBp: number) => ({
    storeId: store.id,
    version: store.version,
    name: store.name,
    code: store.code,
    timezone: store.timezone,
    operationalDayCutoff: store.operationalDayCutoff,
    serviceFeeBp,
    negativeStockPolicy: store.negativeStockPolicy,
    maxOpenCashSessions: store.maxOpenCashSessions,
  });

  Scenario('Admin cadastra uma loja com as configurações padrão', ({ Given, When, Then, And }) => {
    Given('que "marlon" é administrador da organização', marlonIsAdmin);
    When('"marlon" cadastra a loja "Shopping" com o código "shop"', async () => {
      await attempt(async () => {
        createdId = (
          await services.organizations.createStore(marlon.ctx, {
            companyId: org.companyId,
            name: 'Shopping',
            code: 'shop',
          })
        ).id;
      });
    });
    Then('a loja "Shopping" existe com o código "SHOP"', async () => {
      expect(failure).toBeNull();
      const created = await services.organizations.getStore(marlon.ctx, createdId ?? ('' as Id));
      expect(created).toMatchObject({ name: 'Shopping', code: 'SHOP', status: 'ATIVO' });
    });
    And(
      'a loja tem virada do dia às "05:00", taxa de serviço de 10%, estoque negativo "PERMITIR_COM_ALERTA" e 1 caixa aberto',
      async () => {
        const created = await services.organizations.getStore(marlon.ctx, createdId ?? ('' as Id));
        expect(created).toMatchObject({
          timezone: 'America/Sao_Paulo',
          operationalDayCutoff: '05:00',
          serviceFeeBp: 1000,
          negativeStockPolicy: 'PERMITIR_COM_ALERTA',
          maxOpenCashSessions: 1,
        });
      },
    );
    And('a loja tem a estação de cozinha padrão "Cozinha"', async () => {
      const stations = await db
        .select({ name: kitchenStation.name, isDefault: kitchenStation.isDefault })
        .from(kitchenStation)
        .where(eq(kitchenStation.storeId, createdId ?? ('' as Id)));
      expect(stations).toEqual([{ name: 'Cozinha', isDefault: true }]);
    });
    And('a auditoria registra o evento "STORE_CREATED" feito por "marlon"', async () => {
      const rows = await auditOf('STORE_CREATED', createdId ?? ('' as Id));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.actor).toBe(marlon.id);
    });
  });

  Scenario('Código de loja repetido na mesma empresa é recusado', ({ Given, When, Then }) => {
    Given('que "marlon" é administrador da organização', marlonIsAdmin);
    When('"marlon" cadastra a loja "Outro Centro" com o código "centro"', () =>
      attempt(() =>
        services.organizations.createStore(marlon.ctx, {
          companyId: org.companyId,
          name: 'Outro Centro',
          code: 'centro',
        }),
      ),
    );
    Then(
      'a ação é negada com a mensagem "Já existe uma loja com este código nesta empresa."',
      () => {
        expect(failure).toMatchObject({
          code: 'STORE_CODE_TAKEN',
          message: 'Já existe uma loja com este código nesta empresa.',
        });
      },
    );
  });

  Scenario(
    'Admin altera a taxa de serviço e permite dois caixas abertos',
    ({ Given, When, Then, And }) => {
      Given('que "marlon" é administrador da organização', marlonIsAdmin);
      When(
        '"marlon" altera a loja "Centro" para taxa de serviço de 12,5% e 2 caixas abertos',
        async () => {
          const current = await centro();
          await services.organizations.updateStore(marlon.ctx, {
            ...withFee(current, 1250),
            maxOpenCashSessions: 2,
          });
        },
      );
      Then('a loja "Centro" passa a ter taxa de serviço de 12,5% e 2 caixas abertos', async () => {
        expect(await centro()).toMatchObject({
          serviceFeeBp: 1250,
          maxOpenCashSessions: 2,
          version: 1,
        });
      });
      And('a auditoria registra o evento "STORE_UPDATED" com o antes e o depois', async () => {
        const rows = await auditOf('STORE_UPDATED', org.centro);
        expect(rows).toEqual([
          {
            actor: marlon.id,
            before: { serviceFeeBp: 1000, maxOpenCashSessions: 1 },
            after: { serviceFeeBp: 1250, maxOpenCashSessions: 2 },
          },
        ]);
      });
    },
  );

  Scenario('Gerente não altera as configurações da loja', ({ Given, When, Then }) => {
    let carla: RequestContext;
    Given('que "carla" é gerente na loja "Centro"', async () => {
      await marlonIsAdmin();
      const username = uniqueUsername('carla');
      await createTestUser(db, {
        organizationId: org.organizationId,
        username,
        password: 'Gerente@2026',
        storeRoles: [{ role: 'GERENTE', storeId: org.centro }],
      });
      carla = (await loginAs(services, username, 'Gerente@2026')).ctx;
    });
    When('"carla" tenta alterar a taxa de serviço da loja "Centro" para 0%', async () => {
      const current = await centro();
      await attempt(() => services.organizations.updateStore(carla, withFee(current, 0)));
    });
    Then('a ação é negada por falta de permissão', async () => {
      expect(failure).toMatchObject({ code: 'FORBIDDEN' });
      expect((await centro()).serviceFeeBp).toBe(1000);
    });
  });

  Scenario('Duas pessoas alteram a mesma loja ao mesmo tempo', ({ Given, When, Then, And }) => {
    let firstTab: StoreRecord;
    let secondTab: StoreRecord;
    Given('que "marlon" é administrador da organização', marlonIsAdmin);
    And('"marlon" abriu a loja "Centro" para editar em duas abas', async () => {
      firstTab = await centro();
      secondTab = await centro();
    });
    When('"marlon" salva a primeira aba com taxa de serviço de 11%', () =>
      services.organizations.updateStore(marlon.ctx, withFee(firstTab, 1100)),
    );
    And('"marlon" salva a segunda aba com taxa de serviço de 9%', () =>
      attempt(() => services.organizations.updateStore(marlon.ctx, withFee(secondTab, 900))),
    );
    Then(
      'a segunda alteração é recusada com a mensagem "Outra pessoa alterou estes dados. Recarregue a página e tente de novo."',
      () => {
        expect(failure).toMatchObject({
          code: 'CONCURRENT_MODIFICATION',
          message: 'Outra pessoa alterou estes dados. Recarregue a página e tente de novo.',
        });
      },
    );
    And('a loja "Centro" continua com taxa de serviço de 11%', async () => {
      expect((await centro()).serviceFeeBp).toBe(1100);
    });
  });

  Scenario('Não é possível desativar a loja em uso', ({ Given, And, When, Then }) => {
    Given('que "marlon" é administrador da organização', marlonIsAdmin);
    And('"marlon" está trabalhando na loja "Centro"', () => {
      expect(marlon.ctx.storeId).toBe(org.centro);
    });
    When('"marlon" tenta desativar a loja "Centro"', async () => {
      const current = await centro();
      await attempt(() =>
        services.organizations.setStoreStatus(marlon.ctx, {
          storeId: current.id,
          version: current.version,
          status: 'INATIVO',
        }),
      );
    });
    Then('a ação é negada com a mensagem "Troque para outra loja antes de desativar esta."', () => {
      expect(failure).toMatchObject({
        code: 'CANNOT_DISABLE_ACTIVE_STORE',
        message: 'Troque para outra loja antes de desativar esta.',
      });
    });
  });
});
