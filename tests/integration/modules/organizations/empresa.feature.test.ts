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
  type TestOrganization,
  testServices,
  uniqueUsername,
} from '../../../support/identity';

const feature = await loadFeature('tests/features/organizations/empresa.feature', {
  language: 'pt',
});
const { db } = useTestDatabase();

describeFeature(feature, ({ Scenario }) => {
  const services = testServices(db);
  let org: TestOrganization;
  let marlon: { id: Id; ctx: RequestContext };
  let failure: unknown = null;

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

  async function changeCnpj(ctx: RequestContext, cnpj: string) {
    const current = await services.organizations.getCompany(marlon.ctx, org.companyId);
    await attempt(() =>
      services.organizations.updateCompany(ctx, {
        companyId: current.id,
        version: current.version,
        legalName: current.legalName,
        tradeName: current.tradeName,
        cnpj,
      }),
    );
  }

  Scenario('Admin informa um CNPJ válido com pontuação', ({ Given, When, Then, And }) => {
    Given('que "marlon" é administrador da organização', marlonIsAdmin);
    When('"marlon" altera a empresa para o CNPJ "11.222.333/0001-81"', () =>
      changeCnpj(marlon.ctx, '11.222.333/0001-81'),
    );
    Then('a empresa fica com o CNPJ "11222333000181"', async () => {
      expect(failure).toBeNull();
      const current = await services.organizations.getCompany(marlon.ctx, org.companyId);
      expect(current).toMatchObject({ cnpj: '11222333000181', version: 1 });
    });
    And('a auditoria registra o evento "COMPANY_UPDATED" feito por "marlon"', async () => {
      const rows = await db
        .select({
          actor: auditLog.actorUserId,
          before: auditLog.beforeData,
          after: auditLog.afterData,
        })
        .from(auditLog)
        .where(and(eq(auditLog.event, 'COMPANY_UPDATED'), eq(auditLog.entityId, org.companyId)));
      expect(rows).toEqual([
        { actor: marlon.id, before: { cnpj: null }, after: { cnpj: '11222333000181' } },
      ]);
    });
  });

  Scenario('CNPJ com dígito verificador errado é recusado', ({ Given, When, Then }) => {
    Given('que "marlon" é administrador da organização', marlonIsAdmin);
    When('"marlon" altera a empresa para o CNPJ "11.222.333/0001-82"', () =>
      changeCnpj(marlon.ctx, '11.222.333/0001-82'),
    );
    Then('a ação é negada com a mensagem "CNPJ inválido. Confira os 14 dígitos."', () => {
      expect(failure).toMatchObject({
        code: 'INVALID_CNPJ',
        message: 'CNPJ inválido. Confira os 14 dígitos.',
      });
    });
  });

  Scenario('Gerente não altera a empresa', ({ Given, When, Then }) => {
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
    When('"carla" tenta alterar o nome fantasia da empresa', async () => {
      const current = await services.organizations.getCompany(marlon.ctx, org.companyId);
      await attempt(() =>
        services.organizations.updateCompany(carla, {
          companyId: current.id,
          version: current.version,
          legalName: current.legalName,
          tradeName: 'Nome da Carla',
          cnpj: current.cnpj,
        }),
      );
    });
    Then('a ação é negada por falta de permissão', () => {
      expect(failure).toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
