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

const feature = await loadFeature('tests/features/organizations/terminais.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  const services = testServices(db);
  let org: TestOrganization;
  let carla: { id: Id; ctx: RequestContext; sessionToken: string };
  const terminals = new Map<string, Id>();
  let failure: unknown = null;

  async function attempt(work: () => Promise<unknown>) {
    failure = null;
    try {
      await work();
    } catch (error) {
      failure = error;
    }
  }

  async function carlaIsManager() {
    terminals.clear();
    org = await createTestOrganization(db);
    const username = uniqueUsername('carla');
    const id = await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Gerente@2026',
      storeRoles: [{ role: 'GERENTE', storeId: org.centro }],
    });
    const login = await loginAs(services, username, 'Gerente@2026');
    carla = { id, ctx: login.ctx, sessionToken: login.sessionToken };
  }

  async function createTerminal(code: string, name: string, kind: 'CAIXA') {
    const { id } = await services.organizations.createTerminal(carla.ctx, { code, name, kind });
    terminals.set(code, id);
  }

  const terminalId = (code: string) => {
    const id = terminals.get(code);
    if (!id) throw new Error(`terminal ${code} não cadastrado`);
    return id;
  };

  /** A próxima requisição de carla: o servidor recalcula o terminal pela sessão. */
  async function carlaSession() {
    const session = await services.auth.authenticate(carla.sessionToken, meta());
    if (!session) throw new Error('sessão encerrada');
    return session;
  }

  const bind = (code: string) =>
    services.organizations.bindThisDevice(carla.ctx, { terminalId: terminalId(code) });

  Scenario('Gerente registra este aparelho como o Caixa 1', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', carlaIsManager);
    And('"carla" cadastrou o terminal "CX1" "Caixa 1" do tipo "CAIXA"', () =>
      createTerminal('CX1', 'Caixa 1', 'CAIXA'),
    );
    When('"carla" usa este aparelho como o terminal "CX1"', () => bind('CX1'));
    Then('a sessão de "carla" passa a estar no terminal "CX1"', async () => {
      const session = await carlaSession();
      expect(session.context.terminalId).toBe(terminalId('CX1'));
      expect(session.terminalName).toBe('Caixa 1');
    });
    And('a auditoria registra o evento "TERMINAL_BOUND" feito por "carla"', async () => {
      const rows = await db
        .select({ actor: auditLog.actorUserId })
        .from(auditLog)
        .where(and(eq(auditLog.event, 'TERMINAL_BOUND'), eq(auditLog.entityId, terminalId('CX1'))));
      expect(rows).toEqual([{ actor: carla.id }]);
    });
  });

  Scenario('Um aparelho é um terminal só', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', carlaIsManager);
    And('"carla" cadastrou o terminal "CX1" "Caixa 1" do tipo "CAIXA"', () =>
      createTerminal('CX1', 'Caixa 1', 'CAIXA'),
    );
    And('"carla" cadastrou o terminal "CX2" "Caixa 2" do tipo "CAIXA"', () =>
      createTerminal('CX2', 'Caixa 2', 'CAIXA'),
    );
    And('este aparelho é o terminal "CX1"', () => bind('CX1'));
    When('"carla" usa este aparelho como o terminal "CX2"', () => bind('CX2'));
    Then('o terminal "CX1" fica sem aparelho', async () => {
      const cx1 = await services.organizations.getTerminal(carla.ctx, terminalId('CX1'));
      expect(cx1.hasDevice).toBe(false);
    });
    And('a sessão de "carla" passa a estar no terminal "CX2"', async () => {
      expect((await carlaSession()).context.terminalId).toBe(terminalId('CX2'));
    });
  });

  Scenario('Terminal desativado deixa de valer na sessão', ({ Given, And, When, Then }) => {
    Given('que "carla" é gerente na loja "Centro"', carlaIsManager);
    And('"carla" cadastrou o terminal "CX1" "Caixa 1" do tipo "CAIXA"', () =>
      createTerminal('CX1', 'Caixa 1', 'CAIXA'),
    );
    And('este aparelho é o terminal "CX1"', () => bind('CX1'));
    When('"carla" desativa o terminal "CX1"', async () => {
      const cx1 = await services.organizations.getTerminal(carla.ctx, terminalId('CX1'));
      await services.organizations.setTerminalActive(carla.ctx, {
        terminalId: cx1.id,
        version: cx1.version,
        active: false,
      });
    });
    Then('a sessão de "carla" fica sem terminal', async () => {
      const session = await carlaSession();
      expect(session.context.terminalId).toBeNull();
      expect(session.terminalName).toBeNull();
    });
  });

  Scenario('Garçom não cadastra terminais', ({ Given, When, Then }) => {
    let joao: RequestContext;
    Given('que "joao" é garçom na loja "Centro"', async () => {
      org = await createTestOrganization(db);
      const username = uniqueUsername('joao');
      await createTestUser(db, {
        organizationId: org.organizationId,
        username,
        password: 'Garcom@2026',
        storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
      });
      joao = (await loginAs(services, username, 'Garcom@2026')).ctx;
    });
    When('"joao" tenta cadastrar o terminal "CX9" "Caixa 9" do tipo "CAIXA"', () =>
      attempt(() =>
        services.organizations.createTerminal(joao, {
          code: 'CX9',
          name: 'Caixa 9',
          kind: 'CAIXA',
        }),
      ),
    );
    Then('a ação é negada por falta de permissão', () => {
      expect(failure).toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
