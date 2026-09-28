import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { and, desc, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import type { LoginResult } from '@/modules/auth';
import { auditLog } from '@/shared/db/schema';
import { type Id, newId } from '@/shared/kernel';
import { useTestDatabase } from '../../../support/database';
import {
  createTestOrganization,
  createTestUser,
  meta,
  testServices,
  uniqueUsername,
} from '../../../support/identity';

const feature = await loadFeature('tests/features/auth/login.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  const services = testServices(db);
  let joao = '';
  let joaoId: Id = newId();
  let result: LoginResult | null = null;
  let failure: unknown = null;

  async function attempt(username: string, password: string) {
    result = null;
    failure = null;
    try {
      result = await services.auth.login(
        { username, password, sharedDevice: false, deviceToken: null },
        meta(),
      );
    } catch (error) {
      failure = error;
    }
  }

  async function givenJoao(password: string, mustChangePassword = false) {
    const org = await createTestOrganization(db);
    joao = uniqueUsername('joao');
    joaoId = await createTestUser(db, {
      organizationId: org.organizationId,
      username: joao,
      password,
      mustChangePassword,
      storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
    });
  }

  async function lastAuditEvent(userId: Id) {
    const [row] = await db
      .select({ event: auditLog.event, ip: auditLog.ip, requestId: auditLog.requestId })
      .from(auditLog)
      .where(and(eq(auditLog.entityId, userId)))
      .orderBy(desc(auditLog.occurredAt))
      .limit(1);
    return row;
  }

  Scenario('Garçom entra com a senha correta', ({ Given, When, Then, And }) => {
    Given('que o garçom "joao" tem a senha "Mesa@2026" na loja "Centro"', () =>
      givenJoao('Mesa@2026'),
    );
    When('"joao" entra com a senha "Mesa@2026"', () => attempt(joao, 'Mesa@2026'));
    Then('o acesso é liberado na loja "Centro"', async () => {
      expect(failure).toBeNull();
      const session = await services.auth.authenticate(result?.sessionToken ?? null, meta());
      expect(session?.storeName).toBe('Centro');
      expect(session?.mustChangePassword).toBe(false);
    });
    And('a auditoria registra o evento "LOGIN" para "joao"', async () => {
      const [row] = await db
        .select({ event: auditLog.event, ip: auditLog.ip, requestId: auditLog.requestId })
        .from(auditLog)
        .where(and(eq(auditLog.actorUserId, joaoId), eq(auditLog.event, 'LOGIN')));
      expect(row).toEqual({
        event: 'LOGIN',
        ip: expect.stringMatching(/^10\./) as string,
        requestId: 'req-test',
      });
    });
  });

  Scenario('Senha errada é recusada sem revelar o motivo', ({ Given, When, Then, And }) => {
    Given('que o garçom "joao" tem a senha "Mesa@2026" na loja "Centro"', () =>
      givenJoao('Mesa@2026'),
    );
    When('"joao" entra com a senha "errada123"', () => attempt(joao, 'errada123'));
    Then('o acesso é negado com a mensagem "Usuário ou senha inválidos."', () => {
      expect(failure).toMatchObject({ message: 'Usuário ou senha inválidos.' });
    });
    And('a auditoria registra o evento "LOGIN_FAILED" para "joao"', async () => {
      expect((await lastAuditEvent(joaoId))?.event).toBe('LOGIN_FAILED');
    });
  });

  Scenario('Usuário inexistente recebe a mesma resposta', ({ When, Then }) => {
    When('"ninguem" entra com a senha "Mesa@2026"', () =>
      attempt(uniqueUsername('ninguem'), 'Mesa@2026'),
    );
    Then('o acesso é negado com a mensagem "Usuário ou senha inválidos."', () => {
      expect(failure).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Usuário ou senha inválidos.',
      });
    });
  });

  Scenario('Cinco senhas erradas bloqueiam novas tentativas', ({ Given, And, When, Then }) => {
    Given('que o garçom "joao" tem a senha "Mesa@2026" na loja "Centro"', () =>
      givenJoao('Mesa@2026'),
    );
    And('"joao" errou a senha 5 vezes', async () => {
      for (let i = 0; i < 5; i += 1) await attempt(joao, `errada-${String(i)}`);
    });
    When('"joao" entra com a senha "Mesa@2026"', () => attempt(joao, 'Mesa@2026'));
    Then(
      'o acesso é negado com a mensagem "Muitas tentativas. Aguarde alguns minutos e tente de novo."',
      () => {
        expect(failure).toMatchObject({
          code: 'RATE_LIMITED',
          message: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
        });
      },
    );
  });

  Scenario('Senha provisória obriga a troca', ({ Given, When, Then }) => {
    Given('que o garçom "joao" tem a senha provisória "Provisoria1" na loja "Centro"', () =>
      givenJoao('Provisoria1', true),
    );
    When('"joao" entra com a senha "Provisoria1"', () => attempt(joao, 'Provisoria1'));
    Then('o acesso é liberado mas exige trocar a senha', async () => {
      expect(result?.mustChangePassword).toBe(true);
      const session = await services.auth.authenticate(result?.sessionToken ?? null, meta());
      expect(session?.mustChangePassword).toBe(true);
      // Até trocar a senha, nenhuma permissão vale (RN-AUTH-09)
      expect(session?.context.permissions.size).toBe(0);
    });
  });
});
