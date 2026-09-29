// Achados da revisão da Etapa 3 (docs/weeks/etapa-03.md), cada um reproduzido por um teste.
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { auditLog, role, userRoleAssignment } from '@/shared/db/schema';
import { type Id, newId, type RequestContext } from '@/shared/kernel';
import { useTestDatabase } from '../../support/database';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  meta,
  type TestOrganization,
  testServices,
  uniqueUsername,
} from '../../support/identity';

const { db } = useTestDatabase();
const services = testServices(db);
const { organizations, auth } = services;

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { code?: string }).code ?? error,
  );

async function personIn(
  org: TestOrganization,
  input: {
    role: 'ADMIN' | 'GERENTE' | 'CAIXA';
    stores?: Id[];
    organizationWide?: boolean;
    deviceToken?: string;
  },
) {
  const username = uniqueUsername('pessoa');
  const id = await createTestUser(db, {
    organizationId: org.organizationId,
    username,
    password: 'Senha@2026',
    storeRoles: (input.stores ?? []).map((storeId) => ({ role: input.role, storeId })),
    ...(input.organizationWide ? { organizationRole: input.role } : {}),
  });
  const login = await loginAs(services, username, 'Senha@2026', {
    deviceToken: input.deviceToken ?? null,
  });
  return { id, username, ...login };
}

/** Perfil com escopo de EMPRESA (a tela ainda não cria; o modelo aceita — RN-AUTHZ-02). */
async function grantCompanyRole(userId: Id, roleCode: string, companyId: Id) {
  const [found] = await db.select({ id: role.id }).from(role).where(eq(role.code, roleCode));
  if (!found) throw new Error(`perfil ${roleCode} não existe`);
  await db.insert(userRoleAssignment).values({
    id: newId(),
    userId,
    roleId: found.id,
    scopeType: 'COMPANY',
    scopeId: companyId,
    createdBy: null,
  });
}

async function createTerminal(ctx: RequestContext, code: string) {
  return (await organizations.createTerminal(ctx, { code, name: `Caixa ${code}`, kind: 'CAIXA' }))
    .id;
}

async function bind(ctx: RequestContext, terminalId: Id) {
  const current = await organizations.getTerminal(ctx, terminalId);
  return organizations.bindThisDevice(ctx, { terminalId, version: current.version });
}

describe('B-1 — o vínculo do aparelho vale por organização', () => {
  it('tablet reaproveitado por outro restaurante não mexe no terminal do primeiro', async () => {
    const restauranteX = await createTestOrganization(db);
    const restauranteY = await createTestOrganization(db);
    const gerenteX = await personIn(restauranteX, {
      role: 'GERENTE',
      stores: [restauranteX.centro],
    });
    const cxX = await createTerminal(gerenteX.ctx, 'CX1');
    await bind(gerenteX.ctx, cxX);

    // O MESMO aparelho (mesmo cookie) passa a ser usado pelo restaurante Y
    const gerenteY = await personIn(restauranteY, {
      role: 'GERENTE',
      stores: [restauranteY.centro],
      deviceToken: gerenteX.deviceToken,
    });
    expect(gerenteY.ctx.deviceId).toBe(gerenteX.ctx.deviceId);
    const cxY = await createTerminal(gerenteY.ctx, 'CX1');
    await bind(gerenteY.ctx, cxY);

    // X continua com o vínculo; nenhum evento de X foi gravado na auditoria de Y
    const terminalX = await organizations.getTerminal(gerenteX.ctx, cxX);
    expect(terminalX.hasDevice).toBe(true);
    const unbound = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.event, 'TERMINAL_UNBOUND'), eq(auditLog.entityId, cxX)));
    expect(unbound).toEqual([]);
    const sessionY = await auth.authenticate(gerenteY.sessionToken, meta());
    expect(sessionY?.context.terminalId).toBe(cxY);
  });
});

describe('I-2 — vínculo do aparelho com concorrência', () => {
  it('desativar e vincular ao mesmo tempo: nunca fica terminal desativado com aparelho', async () => {
    for (let round = 0; round < 5; round++) {
      const org = await createTestOrganization(db);
      const gerente = await personIn(org, { role: 'GERENTE', stores: [org.centro] });
      const id = await createTerminal(gerente.ctx, 'CX1');
      const results = await Promise.all([
        failureOf(
          organizations.setTerminalActive(gerente.ctx, {
            terminalId: id,
            version: 0,
            active: false,
          }),
        ),
        failureOf(organizations.bindThisDevice(gerente.ctx, { terminalId: id, version: 0 })),
      ]);
      // Uma das duas vence; a outra recebe "outra pessoa alterou" (ou "terminal desativado")
      expect(results.filter((result) => result === null)).toHaveLength(1);
      const final = await organizations.getTerminal(gerente.ctx, id);
      expect(final.active || !final.hasDevice).toBe(true);
    }
  });

  it('troca cruzada de aparelhos: nenhum vínculo confirmado se perde', async () => {
    for (let round = 0; round < 5; round++) {
      const org = await createTestOrganization(db);
      const tablet1 = await personIn(org, { role: 'GERENTE', stores: [org.centro] });
      const tablet2 = await personIn(org, { role: 'GERENTE', stores: [org.centro] });
      const a = await createTerminal(tablet1.ctx, 'A');
      const b = await createTerminal(tablet1.ctx, 'B');
      await bind(tablet2.ctx, a); // A está com o tablet 2 (versão 1)

      const [first, second] = await Promise.all([
        failureOf(organizations.bindThisDevice(tablet1.ctx, { terminalId: a, version: 1 })),
        failureOf(organizations.bindThisDevice(tablet2.ctx, { terminalId: b, version: 0 })),
      ]);
      // Quem recebeu "Pronto" tem o vínculo no fim
      if (first === null)
        expect((await organizations.getTerminal(tablet1.ctx, a)).isThisDevice).toBe(true);
      if (second === null)
        expect((await organizations.getTerminal(tablet2.ctx, b)).isThisDevice).toBe(true);
      expect([first, second]).toContain(null);
    }
  });

  it('tela desatualizada (outro aparelho vinculou antes) recebe "outra pessoa alterou"', async () => {
    const org = await createTestOrganization(db);
    const tablet1 = await personIn(org, { role: 'GERENTE', stores: [org.centro] });
    const tablet2 = await personIn(org, { role: 'GERENTE', stores: [org.centro] });
    const id = await createTerminal(tablet1.ctx, 'CX1');
    await organizations.bindThisDevice(tablet1.ctx, { terminalId: id, version: 0 });
    expect(
      await failureOf(organizations.bindThisDevice(tablet2.ctx, { terminalId: id, version: 0 })),
    ).toBe('CONCURRENT_MODIFICATION');
    expect((await organizations.getTerminal(tablet1.ctx, id)).isThisDevice).toBe(true);
  });
});

describe('I-3 — a auditoria registra a loja AFETADA', () => {
  it('admin trabalhando no Centro altera a Praia: o evento fica na loja Praia', async () => {
    const org = await createTestOrganization(db);
    const admin = await personIn(org, { role: 'ADMIN', organizationWide: true });
    expect(admin.ctx.storeId).toBe(org.centro);
    const praia = await organizations.getStore(admin.ctx, org.praia);
    await organizations.updateStore(admin.ctx, { ...praia, storeId: praia.id, serviceFeeBp: 800 });
    const [row] = await db
      .select({ storeId: auditLog.storeId })
      .from(auditLog)
      .where(and(eq(auditLog.event, 'STORE_UPDATED'), eq(auditLog.entityId, org.praia)));
    expect(row?.storeId).toBe(org.praia);
  });
});

describe('I-4 — sem nenhuma loja, a sessão é encerrada de verdade', () => {
  it('reativar a loja depois não ressuscita o cookie antigo', async () => {
    const org = await createTestOrganization(db);
    const admin = await personIn(org, { role: 'ADMIN', organizationWide: true });
    const caixa = await personIn(org, { role: 'CAIXA', stores: [org.praia] });

    const praia = await organizations.getStore(admin.ctx, org.praia);
    await organizations.setStoreStatus(admin.ctx, {
      storeId: praia.id,
      version: praia.version,
      status: 'INATIVO',
    });
    expect(await auth.authenticate(caixa.sessionToken, meta())).toBeNull();

    const inactive = await organizations.getStore(admin.ctx, org.praia);
    await organizations.setStoreStatus(admin.ctx, {
      storeId: inactive.id,
      version: inactive.version,
      status: 'ATIVO',
    });
    expect(await auth.authenticate(caixa.sessionToken, meta())).toBeNull();
  });

  it('perdeu o perfil na loja atual: vai para outra loja em que tem perfil, com auditoria', async () => {
    const org = await createTestOrganization(db);
    const bia = await personIn(org, { role: 'GERENTE', stores: [org.centro, org.praia] });
    await auth.switchStore(bia.ctx, org.praia);
    await db
      .delete(userRoleAssignment)
      .where(and(eq(userRoleAssignment.userId, bia.id), eq(userRoleAssignment.scopeId, org.praia)));

    const session = await auth.authenticate(bia.sessionToken, meta());
    expect(session?.context.storeId).toBe(org.centro);
    const moved = await db
      .select({ after: auditLog.afterData })
      .from(auditLog)
      .where(and(eq(auditLog.event, 'STORE_SWITCHED'), eq(auditLog.entityId, bia.ctx.sessionId)));
    expect(moved.map((row) => row.after)).toContainEqual({
      storeId: org.centro,
      reason: 'LOJA_INDISPONIVEL',
    });
  });
});

describe('I-6 — permissões por escopo (empresa e loja)', () => {
  it('ADMIN de uma EMPRESA: administra a empresa e cria loja nela, mas não cria empresa', async () => {
    const org = await createTestOrganization(db);
    const pessoa = await personIn(org, { role: 'CAIXA', stores: [org.centro] });
    await grantCompanyRole(pessoa.id, 'ADMIN', org.companyId);
    const { ctx } = await loginAs(services, pessoa.username, 'Senha@2026');

    expect((await organizations.listCompanies(ctx)).map((item) => item.id)).toEqual([
      org.companyId,
    ]);
    expect(await organizations.canCreateCompany(ctx)).toBe(false);
    expect(
      await failureOf(
        organizations.createCompany(ctx, {
          legalName: 'Outra Ltda',
          tradeName: 'Outra',
          cnpj: null,
        }),
      ),
    ).toBe('FORBIDDEN');
    const { id } = await organizations.createStore(ctx, {
      companyId: org.companyId,
      name: 'Nova',
      code: 'NOVA',
    });
    expect((await organizations.getStore(ctx, id)).name).toBe('Nova');
  });

  it('ADMIN só de uma LOJA: altera a própria loja, mas não outra, nem a empresa, nem cria loja', async () => {
    const org = await createTestOrganization(db);
    const { ctx } = await personIn(org, { role: 'ADMIN', stores: [org.centro] });

    const centro = await organizations.getStore(ctx, org.centro);
    await organizations.updateStore(ctx, { ...centro, storeId: centro.id, serviceFeeBp: 1200 });
    expect(await failureOf(organizations.getStore(ctx, org.praia))).toBe('FORBIDDEN');
    expect(await organizations.listCompanies(ctx)).toEqual([]);
    expect(await failureOf(organizations.getCompany(ctx, org.companyId))).toBe('FORBIDDEN');
    expect(
      await failureOf(
        organizations.createStore(ctx, { companyId: org.companyId, name: 'Loja X', code: 'XX' }),
      ),
    ).toBe('FORBIDDEN');
    expect((await organizations.listStores(ctx)).map((store) => store.id)).toEqual([org.centro]);
  });
});
