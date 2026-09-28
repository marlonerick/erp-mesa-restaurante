import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { getPermissionsInStore } from '@/modules/authorization';
import { runInTransaction } from '@/shared/db/transaction';
import type { Id, RequestContext } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  testServices,
  type TestOrganization,
  uniqueUsername,
} from '../../../support/identity';

const feature = await loadFeature('tests/features/authorization/permissoes.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  const services = testServices(db);
  let org: TestOrganization;
  let failure: unknown = null;

  async function userWith(
    base: string,
    roles: { store?: 'centro'; organization?: boolean; role: 'GARCOM' | 'GERENTE' | 'ADMIN' },
  ): Promise<{ id: Id; ctx: RequestContext }> {
    org = await createTestOrganization(db);
    const username = uniqueUsername(base);
    const id = await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Senha@2026',
      ...(roles.organization
        ? { organizationRole: roles.role }
        : { storeRoles: [{ role: roles.role, storeId: org.centro }] }),
    });
    return { id, ctx: (await loginAs(services, username, 'Senha@2026')).ctx };
  }

  const canCreateUsers = async (userId: Id, storeId: Id) =>
    runInTransaction(db, async (tx) =>
      (await getPermissionsInStore(tx, userId, storeId)).has('users.create'),
    );

  async function attempt(action: () => Promise<unknown>) {
    failure = null;
    try {
      await action();
    } catch (error) {
      failure = error;
    }
  }

  Scenario('Garçom não pode cadastrar usuários', ({ Given, When, Then }) => {
    let joao: { id: Id; ctx: RequestContext };
    Given('que "joao" é garçom na loja "Centro"', async () => {
      joao = await userWith('joao', { store: 'centro', role: 'GARCOM' });
    });
    When('"joao" tenta cadastrar um usuário na loja "Centro"', () =>
      attempt(() =>
        services.users.create(joao.ctx, {
          name: 'Novo',
          username: uniqueUsername('novo'),
          temporaryPassword: 'Inicio2026',
          roleCodes: ['GARCOM'],
        }),
      ),
    );
    Then('a ação é negada com a mensagem "Você não tem permissão para esta ação."', () => {
      expect(failure).toMatchObject({
        code: 'FORBIDDEN',
        message: 'Você não tem permissão para esta ação.',
      });
    });
  });

  Scenario('Perfil em uma loja não vale em outra', ({ Given, Then, But }) => {
    let carla: { id: Id; ctx: RequestContext };
    Given('que "carla" é gerente na loja "Centro"', async () => {
      carla = await userWith('carla', { store: 'centro', role: 'GERENTE' });
    });
    Then('"carla" pode cadastrar usuários na loja "Centro"', async () => {
      expect(await canCreateUsers(carla.id, org.centro)).toBe(true);
      await expect(
        services.users.create(carla.ctx, {
          name: 'Garçom Novo',
          username: uniqueUsername('novo'),
          temporaryPassword: 'Inicio2026',
          roleCodes: ['GARCOM'],
        }),
      ).resolves.toHaveProperty('id');
    });
    But('"carla" não pode cadastrar usuários na loja "Praia"', async () => {
      expect(await canCreateUsers(carla.id, org.praia)).toBe(false);
    });
  });

  Scenario('Perfil na organização vale em todas as lojas', ({ Given, Then, And }) => {
    let dona: { id: Id; ctx: RequestContext };
    Given('que "dona" é administradora da organização', async () => {
      dona = await userWith('dona', { organization: true, role: 'ADMIN' });
    });
    Then('"dona" pode cadastrar usuários na loja "Centro"', async () => {
      expect(await canCreateUsers(dona.id, org.centro)).toBe(true);
    });
    And('"dona" pode cadastrar usuários na loja "Praia"', async () => {
      expect(await canCreateUsers(dona.id, org.praia)).toBe(true);
    });
  });

  Scenario('Gerente não pode tornar alguém administrador', ({ Given, When, Then }) => {
    let carla: { id: Id; ctx: RequestContext };
    Given('que "carla" é gerente na loja "Centro"', async () => {
      carla = await userWith('carla', { store: 'centro', role: 'GERENTE' });
    });
    When('"carla" tenta dar o perfil ADMIN a um usuário na loja "Centro"', async () => {
      const { id } = await services.users.create(carla.ctx, {
        name: 'Garçom',
        username: uniqueUsername('garcom'),
        temporaryPassword: 'Inicio2026',
        roleCodes: ['GARCOM'],
      });
      await attempt(() => services.users.setRoles(carla.ctx, { userId: id, roleCodes: ['ADMIN'] }));
    });
    Then('a ação é negada com a mensagem "Você não pode atribuir este perfil."', () => {
      expect(failure).toMatchObject({
        code: 'ROLE_ASSIGNMENT_NOT_ALLOWED',
        message: 'Você não pode atribuir este perfil.',
      });
    });
  });
});
