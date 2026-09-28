import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import type { Id } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  meta,
  testServices,
  uniqueUsername,
} from '../../../support/identity';

const feature = await loadFeature('tests/features/auth/troca-rapida.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  const services = testServices(db);
  let tablet = '';
  let joao = '';
  let ana = '';
  let anaId: Id | null = null;
  let joaoSession = '';
  let switched: { sessionToken: string } | null = null;
  let failure: unknown = null;

  async function bothLoggedInOnTablet() {
    const org = await createTestOrganization(db);
    joao = uniqueUsername('joao');
    ana = uniqueUsername('ana');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username: joao,
      password: 'Mesa@2026',
      pin: '305917',
      storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
    });
    anaId = await createTestUser(db, {
      organizationId: org.organizationId,
      username: ana,
      password: 'Salao@2026',
      pin: '482915',
      storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
    });
    tablet = (await loginAs(services, joao, 'Mesa@2026', { sharedDevice: true })).deviceToken;
    await loginAs(services, ana, 'Salao@2026', { sharedDevice: true, deviceToken: tablet });
  }

  async function anaTypesPin(pin: string) {
    switched = null;
    failure = null;
    try {
      if (!anaId) throw new Error('cenário incompleto');
      switched = await services.auth.switchUser(
        { deviceToken: tablet, userId: anaId, pin },
        meta(),
      );
    } catch (error) {
      failure = error;
    }
  }

  Scenario('Garçom troca de usuário com o PIN', ({ Given, And, When, Then }) => {
    Given('que "joao" e "ana" já entraram com senha no tablet do salão', bothLoggedInOnTablet);
    And('"joao" está usando o tablet do salão', async () => {
      joaoSession = (
        await loginAs(services, joao, 'Mesa@2026', { sharedDevice: true, deviceToken: tablet })
      ).sessionToken;
    });
    When('"ana" escolhe seu nome e digita o PIN "482915"', () => anaTypesPin('482915'));
    Then('"ana" passa a usar o tablet do salão', async () => {
      expect(failure).toBeNull();
      const session = await services.auth.authenticate(switched?.sessionToken ?? null, meta());
      expect(session?.username).toBe(ana);
      expect(session?.sharedDevice).toBe(true);
    });
    And('a sessão de "joao" no tablet do salão foi encerrada', async () => {
      expect(await services.auth.authenticate(joaoSession, meta())).toBeNull();
    });
  });

  Scenario(
    'Quem nunca entrou com senha no aparelho não aparece na troca',
    ({ Given, When, Then }) => {
      let names: string[] = ['não consultado'];
      Given('que "joao" e "ana" já entraram com senha no tablet do salão', async () => {
        await bothLoggedInOnTablet();
        const onTablet = await services.auth.listDeviceUsers(tablet);
        expect(onTablet.map((user) => user.name).sort()).toEqual([ana, joao].sort());
      });
      When('alguém abre a tela de troca em outro aparelho', async () => {
        names = (await services.auth.listDeviceUsers('token-de-outro-aparelho')).map((u) => u.name);
      });
      Then('a lista de usuários do aparelho está vazia', () => {
        expect(names).toEqual([]);
      });
    },
  );

  Scenario('Cinco PINs errados travam o PIN', ({ Given, When, And, Then }) => {
    Given('que "joao" e "ana" já entraram com senha no tablet do salão', bothLoggedInOnTablet);
    When('"ana" digita o PIN errado 5 vezes', async () => {
      for (let i = 0; i < 5; i += 1) await anaTypesPin('000001');
    });
    And('"ana" escolhe seu nome e digita o PIN "482915"', () => anaTypesPin('482915'));
    Then(
      'a troca é negada com a mensagem "PIN bloqueado após 5 tentativas. Entre com sua senha."',
      () => {
        expect(failure).toMatchObject({
          code: 'PIN_LOCKED',
          message: 'PIN bloqueado após 5 tentativas. Entre com sua senha.',
        });
      },
    );
  });
});
