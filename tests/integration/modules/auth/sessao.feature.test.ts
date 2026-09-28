import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import type { AuthenticatedSession } from '@/modules/auth';
import type { Id } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import { FakeClock } from '../../../support/fake-clock';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  meta,
  TEST_START,
  testServices,
  uniqueUsername,
} from '../../../support/identity';

const feature = await loadFeature('tests/features/auth/sessao.feature', { language: 'pt' });
const { db } = useTestDatabase();
const HOUR = 60 * 60 * 1000;

describeFeature(feature, ({ Scenario }) => {
  let services = testServices(db);
  let clock = new FakeClock(TEST_START);
  let sessionToken = '';
  let joaoId: Id | null = null;
  let managerCtx: Awaited<ReturnType<typeof loginAs>>['ctx'] | null = null;
  let session: AuthenticatedSession | null = null;

  async function joaoLogsIn(sharedDevice: boolean) {
    clock = new FakeClock(TEST_START);
    services = testServices(db, clock);
    const org = await createTestOrganization(db);
    const joao = uniqueUsername('joao');
    joaoId = await createTestUser(db, {
      organizationId: org.organizationId,
      username: joao,
      password: 'Mesa@2026',
      storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
    });
    const carla = uniqueUsername('carla');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username: carla,
      password: 'Gerente@2026',
      storeRoles: [{ role: 'GERENTE', storeId: org.centro }],
    });
    managerCtx = (await loginAs(services, carla, 'Gerente@2026')).ctx;
    sessionToken = (await loginAs(services, joao, 'Mesa@2026', { sharedDevice })).sessionToken;
  }

  const tryToUse = async () => {
    session = await services.auth.authenticate(sessionToken, meta());
  };

  Scenario('Sessão termina após 12 horas sem uso', ({ Given, When, Then }) => {
    Given('que "joao" entrou às 18:00 em um aparelho individual', () => joaoLogsIn(false));
    When('"joao" tenta usar o sistema às 06:01 do dia seguinte', async () => {
      clock.set(new Date(TEST_START.getTime() + 12 * HOUR + 60_000));
      await tryToUse();
    });
    Then('a sessão está encerrada', () => {
      expect(session).toBeNull();
    });
  });

  Scenario(
    'Sessão termina 7 dias após o login mesmo com uso contínuo',
    ({ Given, And, When, Then }) => {
      Given('que "joao" entrou às 18:00 em um aparelho individual', () => joaoLogsIn(false));
      And('"joao" usou o sistema a cada 6 horas durante 7 dias', async () => {
        for (let step = 1; step < 28; step += 1) {
          clock.advanceHours(6);
          await tryToUse();
          expect(session, `uso após ${String(step * 6)} h`).not.toBeNull();
        }
      });
      When('"joao" tenta usar o sistema 7 dias e 1 minuto após o login', async () => {
        clock.set(new Date(TEST_START.getTime() + 7 * 24 * HOUR + 60_000));
        await tryToUse();
      });
      Then('a sessão está encerrada', () => {
        expect(session).toBeNull();
      });
    },
  );

  Scenario(
    'Aparelho compartilhado encerra a sessão após 3 minutos sem uso',
    ({ Given, When, Then }) => {
      Given('que "joao" entrou às 18:00 em um aparelho compartilhado', () => joaoLogsIn(true));
      When('"joao" tenta usar o sistema às 18:04', async () => {
        clock.advanceMinutes(4);
        await tryToUse();
      });
      Then('a sessão está encerrada', () => {
        expect(session).toBeNull();
      });
    },
  );

  Scenario('Desativar o usuário encerra a sessão dele', ({ Given, When, Then }) => {
    Given('que "joao" entrou às 18:00 em um aparelho individual', () => joaoLogsIn(false));
    When('o gerente desativa "joao"', async () => {
      if (!managerCtx || !joaoId) throw new Error('cenário incompleto');
      await services.users.disable(managerCtx, { userId: joaoId });
      await tryToUse();
    });
    Then('a sessão está encerrada', () => {
      expect(session).toBeNull();
    });
  });
});
