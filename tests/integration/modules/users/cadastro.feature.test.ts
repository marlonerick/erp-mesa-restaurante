import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { and, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import type { UserSummary } from '@/modules/users';
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

const feature = await loadFeature('tests/features/users/cadastro.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  const services = testServices(db);
  let org: TestOrganization;
  let carla: { id: Id; ctx: RequestContext };
  let pedro = '';
  let pedroId: Id | null = null;
  let failure: unknown = null;

  async function carlaIsManager() {
    org = await createTestOrganization(db);
    const username = uniqueUsername('carla');
    const id = await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Gerente@2026',
      storeRoles: [{ role: 'GERENTE', storeId: org.centro }],
    });
    carla = { id, ctx: (await loginAs(services, username, 'Gerente@2026')).ctx };
  }

  async function carlaCreates(name: string, username: string) {
    failure = null;
    try {
      pedroId = (
        await services.users.create(carla.ctx, {
          name,
          username,
          temporaryPassword: 'Inicio2026',
          roleCodes: ['GARCOM'],
        })
      ).id;
    } catch (error) {
      failure = error;
    }
  }

  Scenario('Gerente cadastra um garçom com senha provisória', ({ Given, When, Then, And }) => {
    Given('que "carla" é gerente na loja "Centro"', carlaIsManager);
    When(
      '"carla" cadastra o garçom "Pedro Lima" com o usuário "pedro" e a senha provisória "Inicio2026"',
      async () => {
        pedro = uniqueUsername('pedro');
        await carlaCreates('Pedro Lima', pedro);
      },
    );
    Then('"pedro" consegue entrar com a senha "Inicio2026" mas precisa trocá-la', async () => {
      expect(failure).toBeNull();
      const result = await services.auth.login(
        { username: pedro, password: 'Inicio2026', sharedDevice: false, deviceToken: null },
        meta(),
      );
      expect(result.mustChangePassword).toBe(true);
    });
    And('a auditoria registra o evento "USER_CREATED" feito por "carla"', async () => {
      const rows = await db
        .select({ actor: auditLog.actorUserId, after: auditLog.afterData })
        .from(auditLog)
        .where(and(eq(auditLog.event, 'USER_CREATED'), eq(auditLog.entityId, pedroId ?? '')));
      expect(rows).toEqual([{ actor: carla.id, after: { name: 'Pedro Lima', username: pedro } }]);
    });
  });

  Scenario('Nome de usuário repetido é recusado', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', carlaIsManager);
    And('já existe o usuário "pedro"', async () => {
      pedro = uniqueUsername('pedro');
      await createTestUser(db, {
        organizationId: org.organizationId,
        username: pedro,
        password: 'Qualquer@2026',
      });
    });
    When(
      '"carla" cadastra o garçom "Outro Pedro" com o usuário "Pedro" e a senha provisória "Inicio2026"',
      // Maiúsculas não criam um usuário diferente (RN-USERS-02)
      () => carlaCreates('Outro Pedro', pedro.toUpperCase()),
    );
    Then('a ação é negada com a mensagem "Este nome de usuário já está em uso."', () => {
      expect(failure).toMatchObject({
        code: 'USERNAME_TAKEN',
        message: 'Este nome de usuário já está em uso.',
      });
    });
  });

  Scenario('Gerente não vê usuários de outra loja', ({ Given, And, When, Then }) => {
    let rui = '';
    let list: UserSummary[] = [];
    Given('que "carla" é gerente na loja "Centro"', carlaIsManager);
    And('"rui" é garçom somente na loja "Praia"', async () => {
      rui = uniqueUsername('rui');
      await createTestUser(db, {
        organizationId: org.organizationId,
        username: rui,
        password: 'Garcom@2026',
        storeRoles: [{ role: 'GARCOM', storeId: org.praia }],
      });
    });
    When('"carla" lista os usuários da loja "Centro"', async () => {
      list = await services.users.list(carla.ctx);
    });
    Then('"rui" não aparece na lista', () => {
      expect(list.map((user) => user.username)).not.toContain(rui);
      expect(list.map((user) => user.id)).toContain(carla.id);
    });
  });
});
