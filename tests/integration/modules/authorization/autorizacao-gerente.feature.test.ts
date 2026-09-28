import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { and, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { authorizeOrElevate } from '@/modules/authorization';
import { auditLog } from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
import type { Id, RequestContext } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import { FakeClock } from '../../../support/fake-clock';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  TEST_START,
  testServices,
  uniqueUsername,
} from '../../../support/identity';

const feature = await loadFeature('tests/features/authorization/autorizacao-gerente.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  let clock = new FakeClock(TEST_START);
  let services = testServices(db, clock);
  let bia: { id: Id; ctx: RequestContext };
  let carla = { id: '' as Id, username: '' };
  let davi = '';
  let grantToken = '';
  let authorizer: Id | null = null;
  let failure: unknown = null;

  async function setup() {
    clock = new FakeClock(TEST_START);
    services = testServices(db, clock);
    const org = await createTestOrganization(db);
    const biaName = uniqueUsername('bia');
    const biaId = await createTestUser(db, {
      organizationId: org.organizationId,
      username: biaName,
      password: 'Caixa@2026',
      storeRoles: [{ role: 'CAIXA', storeId: org.centro }],
    });
    carla = { username: uniqueUsername('carla'), id: '' as Id };
    carla.id = await createTestUser(db, {
      organizationId: org.organizationId,
      username: carla.username,
      password: 'Gerente@2026',
      pin: '739104',
      storeRoles: [{ role: 'GERENTE', storeId: org.centro }],
    });
    davi = uniqueUsername('davi');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username: davi,
      password: 'Caixa@2026',
      pin: '551208',
      storeRoles: [{ role: 'CAIXA', storeId: org.centro }],
    });
    bia = { id: biaId, ctx: (await loginAs(services, biaName, 'Caixa@2026')).ctx };
  }

  async function attempt(action: () => Promise<unknown>) {
    failure = null;
    try {
      await action();
    } catch (error) {
      failure = error;
    }
  }

  const authorize = async (username: string, pin: string) => {
    grantToken = (
      await services.auth.requestElevation(bia.ctx, {
        authorizerUsername: username,
        pin,
        permission: 'orders.cancel',
      })
    ).grantToken;
  };

  // Ação protegida de exemplo: na Etapa 6 será "cancelar item enviado"
  const protectedAction = () =>
    runInTransaction(db, async (tx) => {
      authorizer = (await authorizeOrElevate(tx, bia.ctx, 'orders.cancel', grantToken))
        .authorizerUserId;
    });

  const GIVEN = 'que "bia" é caixa e "carla" é gerente na loja "Centro"';
  const WHEN_AUTHORIZE =
    '"carla" autoriza com o PIN "739104" a permissão "orders.cancel" para "bia"';

  Scenario(
    'Gerente autoriza com o PIN uma ação que o caixa não pode fazer',
    ({ Given, When, Then, And }) => {
      Given(GIVEN, setup);
      When(WHEN_AUTHORIZE, () => authorize(carla.username, '739104'));
      Then('"bia" consegue executar a ação protegida por "orders.cancel"', async () => {
        expect(bia.ctx.permissions.has('orders.cancel')).toBe(false);
        await protectedAction();
        expect(authorizer).toBe(carla.id);
      });
      And('a auditoria registra que "carla" autorizou "bia"', async () => {
        const rows = await db
          .select({ authorizer: auditLog.authorizerUserId })
          .from(auditLog)
          .where(
            and(eq(auditLog.event, 'ELEVATED_AUTH_GRANTED'), eq(auditLog.actorUserId, bia.id)),
          );
        expect(rows).toEqual([{ authorizer: carla.id }]);
      });
    },
  );

  Scenario('A autorização vale uma única vez', ({ Given, When, And, Then }) => {
    Given(GIVEN, setup);
    When(WHEN_AUTHORIZE, () => authorize(carla.username, '739104'));
    And('"bia" executa a ação protegida por "orders.cancel"', protectedAction);
    Then('"bia" não consegue repetir a ação com a mesma autorização', async () => {
      await attempt(protectedAction);
      expect(failure).toMatchObject({ code: 'ELEVATED_GRANT_INVALID' });
    });
  });

  Scenario('A autorização expira em 60 segundos', ({ Given, When, And, Then }) => {
    Given(GIVEN, setup);
    When(WHEN_AUTHORIZE, () => authorize(carla.username, '739104'));
    And('passam 61 segundos', () => {
      clock.advanceSeconds(61);
    });
    Then('"bia" não consegue repetir a ação com a mesma autorização', async () => {
      await attempt(protectedAction);
      expect(failure).toMatchObject({ code: 'ELEVATED_GRANT_INVALID' });
    });
  });

  Scenario('Outro caixa não pode autorizar', ({ Given, When, Then }) => {
    Given(GIVEN, setup);
    When(
      'o caixa "davi" tenta autorizar com o PIN "551208" a permissão "orders.cancel" para "bia"',
      () => attempt(() => authorize(davi, '551208')),
    );
    Then('a ação é negada com a mensagem "Este usuário não pode autorizar esta ação."', () => {
      expect(failure).toMatchObject({
        code: 'AUTHORIZER_NOT_ALLOWED',
        message: 'Este usuário não pode autorizar esta ação.',
      });
    });
  });
});
