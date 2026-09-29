import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { and, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { auditLog } from '@/shared/db/schema';
import type { Id, RequestContext } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  meta,
  type TestOrganization,
  testServices,
  uniqueUsername,
} from '../../../support/identity';

const feature = await loadFeature('tests/features/organizations/troca-de-loja.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

interface Person {
  readonly id: Id;
  readonly ctx: RequestContext;
  readonly sessionToken: string;
}

describeFeature(feature, ({ Scenario }) => {
  const services = testServices(db);
  let org: TestOrganization;
  let bia: Person;
  let failure: unknown = null;

  async function person(
    base: string,
    password: string,
    storeRoles: { role: 'GERENTE' | 'CAIXA'; storeId: Id }[],
  ): Promise<Person> {
    const username = uniqueUsername(base);
    const id = await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password,
      storeRoles,
    });
    const login = await loginAs(services, username, password);
    return { id, ctx: login.ctx, sessionToken: login.sessionToken };
  }

  async function biaInTwoStores() {
    org = await createTestOrganization(db);
    bia = await person('bia', 'Caixa@2026', [
      { role: 'GERENTE', storeId: org.centro },
      { role: 'CAIXA', storeId: org.praia },
    ]);
  }

  /** A próxima requisição: o servidor monta o contexto a partir da sessão. */
  async function sessionOf(who: Person) {
    const session = await services.auth.authenticate(who.sessionToken, meta());
    if (!session) throw new Error('sessão encerrada');
    return session;
  }

  Scenario('Gerente de uma loja e caixa de outra troca de loja', ({ Given, And, When, Then }) => {
    Given('que "bia" é gerente na loja "Centro" e caixa na loja "Praia"', biaInTwoStores);
    And('"bia" está trabalhando na loja "Centro"', () => {
      expect(bia.ctx.storeId).toBe(org.centro);
      expect(bia.ctx.permissions.has('users.read')).toBe(true);
    });
    When('"bia" troca para a loja "Praia"', () => services.auth.switchStore(bia.ctx, org.praia));
    Then('a sessão de "bia" passa a estar na loja "Praia"', async () => {
      const session = await sessionOf(bia);
      expect(session.context.storeId).toBe(org.praia);
      expect(session.storeName).toBe('Praia');
    });
    And('"bia" não tem mais a permissão "users.read"', async () => {
      const session = await sessionOf(bia);
      expect(session.context.permissions.has('users.read')).toBe(false);
      expect(session.context.permissions.has('cashier.open')).toBe(true);
    });
    And('a auditoria registra o evento "STORE_SWITCHED" feito por "bia"', async () => {
      const rows = await db
        .select({
          actor: auditLog.actorUserId,
          before: auditLog.beforeData,
          after: auditLog.afterData,
        })
        .from(auditLog)
        .where(and(eq(auditLog.event, 'STORE_SWITCHED'), eq(auditLog.entityId, bia.ctx.sessionId)));
      expect(rows).toEqual([
        { actor: bia.id, before: { storeId: org.centro }, after: { storeId: org.praia } },
      ]);
    });
  });

  Scenario('Não é possível trocar para uma loja sem perfil', ({ Given, When, Then, And }) => {
    let carla: Person;
    Given('que "carla" é gerente na loja "Centro"', async () => {
      org = await createTestOrganization(db);
      carla = await person('carla', 'Gerente@2026', [{ role: 'GERENTE', storeId: org.centro }]);
    });
    When('"carla" tenta trocar para a loja "Praia"', async () => {
      failure = null;
      try {
        await services.auth.switchStore(carla.ctx, org.praia);
      } catch (error) {
        failure = error;
      }
    });
    Then('a ação é negada com a mensagem "Loja não encontrada."', () => {
      expect(failure).toMatchObject({ code: 'STORE_NOT_FOUND', message: 'Loja não encontrada.' });
    });
    And('a sessão de "carla" continua na loja "Centro"', async () => {
      expect((await sessionOf(carla)).context.storeId).toBe(org.centro);
    });
  });

  Scenario('Loja desativada leva a sessão para outra loja', ({ Given, And, When, Then }) => {
    Given('que "bia" é gerente na loja "Centro" e caixa na loja "Praia"', biaInTwoStores);
    And('"bia" está trabalhando na loja "Praia"', async () => {
      await services.auth.switchStore(bia.ctx, org.praia);
      expect((await sessionOf(bia)).context.storeId).toBe(org.praia);
    });
    When('o administrador desativa a loja "Praia"', async () => {
      const username = uniqueUsername('marlon');
      await createTestUser(db, {
        organizationId: org.organizationId,
        username,
        password: 'Admin@2026',
        organizationRole: 'ADMIN',
      });
      const admin = (await loginAs(services, username, 'Admin@2026')).ctx;
      const praia = await services.organizations.getStore(admin, org.praia);
      await services.organizations.setStoreStatus(admin, {
        storeId: praia.id,
        version: praia.version,
        status: 'INATIVO',
      });
    });
    Then('na próxima requisição a sessão de "bia" está na loja "Centro"', async () => {
      const session = await sessionOf(bia);
      expect(session.context.storeId).toBe(org.centro);
      // e a troca ficou gravada: a requisição seguinte já começa no Centro
      expect((await sessionOf(bia)).storeName).toBe('Centro');
    });
  });
});
