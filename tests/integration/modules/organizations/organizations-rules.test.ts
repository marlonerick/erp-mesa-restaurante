import { describe, expect, it } from 'vitest';
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

const { db } = useTestDatabase();
const services = testServices(db);
const { organizations } = services;

async function adminOf(org: TestOrganization) {
  const username = uniqueUsername('admin');
  await createTestUser(db, {
    organizationId: org.organizationId,
    username,
    password: 'Admin@2026',
    organizationRole: 'ADMIN',
  });
  return loginAs(services, username, 'Admin@2026');
}

async function managerOf(org: TestOrganization, storeId: Id) {
  const username = uniqueUsername('gerente');
  await createTestUser(db, {
    organizationId: org.organizationId,
    username,
    password: 'Gerente@2026',
    storeRoles: [{ role: 'GERENTE', storeId }],
  });
  return loginAs(services, username, 'Gerente@2026');
}

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { code?: string }).code ?? error,
  );

async function disable(ctx: RequestContext, storeId: Id) {
  const current = await organizations.getStore(ctx, storeId);
  return organizations.setStoreStatus(ctx, {
    storeId,
    version: current.version,
    status: 'INATIVO',
  });
}

describe('lojas — regras de borda (RN-ORG-05 a RN-ORG-07)', () => {
  it('dois admins desativando ao mesmo tempo a loja um do outro: sobra uma loja ativa', async () => {
    const org = await createTestOrganization(db);
    const noCentro = await adminOf(org); // entra no Centro (ordem alfabética)
    const naPraia = await adminOf(org);
    await services.auth.switchStore(naPraia.ctx, org.praia);
    const praiaCtx = { ...naPraia.ctx, storeId: org.praia };

    // Cada um lê a versão da loja do outro e desativa ao mesmo tempo
    const praia = await organizations.getStore(noCentro.ctx, org.praia);
    const centro = await organizations.getStore(praiaCtx, org.centro);
    const results = await Promise.all([
      failureOf(
        organizations.setStoreStatus(noCentro.ctx, {
          storeId: praia.id,
          version: praia.version,
          status: 'INATIVO',
        }),
      ),
      failureOf(
        organizations.setStoreStatus(praiaCtx, {
          storeId: centro.id,
          version: centro.version,
          status: 'INATIVO',
        }),
      ),
    ]);
    expect(results.sort()).toEqual(['LAST_ACTIVE_STORE', null].sort());
    const active = (await organizations.listStores(noCentro.ctx)).filter(
      (store) => store.status === 'ATIVO',
    );
    expect(active).toHaveLength(1);
  });

  it('loja desativada pode ser reativada', async () => {
    const org = await createTestOrganization(db);
    const { ctx } = await adminOf(org);
    await disable(ctx, org.praia);
    const praia = await organizations.getStore(ctx, org.praia);
    expect(praia.status).toBe('INATIVO');
    await organizations.setStoreStatus(ctx, {
      storeId: praia.id,
      version: praia.version,
      status: 'ATIVO',
    });
    expect((await organizations.getStore(ctx, org.praia)).status).toBe('ATIVO');
  });
  it('admin de outra organização não enxerga nem altera a loja', async () => {
    const org = await createTestOrganization(db);
    const outra = await createTestOrganization(db);
    const { ctx } = await adminOf(outra);
    expect(await failureOf(organizations.getStore(ctx, org.centro))).toBe('STORE_NOT_FOUND');
    expect(await failureOf(organizations.getCompany(ctx, org.companyId))).toBe('COMPANY_NOT_FOUND');
    const list = await organizations.listStores(ctx);
    expect(list.map((store) => store.id)).not.toContain(org.centro);
  });

  it('gerente não cria loja nem empresa', async () => {
    const org = await createTestOrganization(db);
    const { ctx } = await managerOf(org, org.centro);
    expect(
      await failureOf(
        organizations.createStore(ctx, { companyId: org.companyId, name: 'X', code: 'XX' }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await failureOf(
        organizations.createCompany(ctx, { legalName: 'X Ltda', tradeName: 'X', cnpj: null }),
      ),
    ).toBe('FORBIDDEN');
  });

  it('salvar sem mudança não grava nem muda a versão', async () => {
    const org = await createTestOrganization(db);
    const { ctx } = await adminOf(org);
    const current = await organizations.getStore(ctx, org.centro);
    await organizations.updateStore(ctx, { storeId: current.id, ...current });
    expect((await organizations.getStore(ctx, org.centro)).version).toBe(current.version);
  });

  it('CNPJ repetido em outra empresa é recusado', async () => {
    const org = await createTestOrganization(db);
    const { ctx } = await adminOf(org);
    const cnpj = '11444777000161';
    await organizations.createCompany(ctx, {
      legalName: 'Primeira Ltda',
      tradeName: 'Primeira',
      cnpj,
    });
    expect(
      await failureOf(
        organizations.createCompany(ctx, { legalName: 'Segunda Ltda', tradeName: 'Segunda', cnpj }),
      ),
    ).toBe('CNPJ_TAKEN');
  });
});

describe('terminais — regras de borda (RN-ORG-08, RN-ORG-09)', () => {
  it('terminal de outra loja é "não encontrado" (isolamento)', async () => {
    const org = await createTestOrganization(db);
    const centro = await managerOf(org, org.centro);
    const praia = await managerOf(org, org.praia);
    const { id } = await organizations.createTerminal(centro.ctx, {
      code: 'CX1',
      name: 'Caixa 1',
      kind: 'CAIXA',
    });
    expect(await failureOf(organizations.getTerminal(praia.ctx, id))).toBe('TERMINAL_NOT_FOUND');
    expect(
      await failureOf(organizations.bindThisDevice(praia.ctx, { terminalId: id, version: 0 })),
    ).toBe('TERMINAL_NOT_FOUND');
    expect(await organizations.listTerminals(praia.ctx)).toEqual([]);
  });

  it('o mesmo código pode existir em lojas diferentes, mas não na mesma', async () => {
    const org = await createTestOrganization(db);
    const centro = await managerOf(org, org.centro);
    const praia = await managerOf(org, org.praia);
    const input = { code: 'cx1', name: 'Caixa 1', kind: 'CAIXA' as const };
    await organizations.createTerminal(centro.ctx, input);
    await organizations.createTerminal(praia.ctx, input);
    expect(await failureOf(organizations.createTerminal(centro.ctx, input))).toBe(
      'TERMINAL_CODE_TAKEN',
    );
  });

  it('sessão sem aparelho identificado não vincula', async () => {
    const org = await createTestOrganization(db);
    const { ctx } = await managerOf(org, org.centro);
    const { id } = await organizations.createTerminal(ctx, {
      code: 'CX1',
      name: 'Caixa 1',
      kind: 'CAIXA',
    });
    expect(
      await failureOf(
        organizations.bindThisDevice({ ...ctx, deviceId: null }, { terminalId: id, version: 0 }),
      ),
    ).toBe('DEVICE_REQUIRED');
  });

  it('terminal desativado não aceita vínculo', async () => {
    const org = await createTestOrganization(db);
    const { ctx } = await managerOf(org, org.centro);
    const { id } = await organizations.createTerminal(ctx, {
      code: 'CX1',
      name: 'Caixa 1',
      kind: 'CAIXA',
    });
    await organizations.setTerminalActive(ctx, { terminalId: id, version: 0, active: false });
    expect(await failureOf(organizations.bindThisDevice(ctx, { terminalId: id, version: 0 }))).toBe(
      'TERMINAL_INACTIVE',
    );
  });

  it('vincular este aparelho em outra loja desfaz o vínculo da primeira', async () => {
    const org = await createTestOrganization(db);
    const username = uniqueUsername('bia');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Gerente@2026',
      storeRoles: [
        { role: 'GERENTE', storeId: org.centro },
        { role: 'GERENTE', storeId: org.praia },
      ],
    });
    const login = await loginAs(services, username, 'Gerente@2026');
    const centroTerminal = await organizations.createTerminal(login.ctx, {
      code: 'CX1',
      name: 'Caixa Centro',
      kind: 'CAIXA',
    });
    await organizations.bindThisDevice(login.ctx, { terminalId: centroTerminal.id, version: 0 });

    await services.auth.switchStore(login.ctx, org.praia);
    const inPraia = await services.auth.authenticate(login.sessionToken, meta());
    if (!inPraia) throw new Error('sessão encerrada');
    const praiaTerminal = await organizations.createTerminal(inPraia.context, {
      code: 'CX1',
      name: 'Caixa Praia',
      kind: 'CAIXA',
    });
    await organizations.bindThisDevice(inPraia.context, {
      terminalId: praiaTerminal.id,
      version: 0,
    });

    await services.auth.switchStore(inPraia.context, org.centro);
    const back = await services.auth.authenticate(login.sessionToken, meta());
    expect(back?.context.terminalId).toBeNull();
    const centro = await organizations.getTerminal(back?.context ?? login.ctx, centroTerminal.id);
    expect(centro.hasDevice).toBe(false);
  });

  it('a lista nunca expõe o id do aparelho', async () => {
    const org = await createTestOrganization(db);
    const { ctx } = await managerOf(org, org.centro);
    const { id } = await organizations.createTerminal(ctx, {
      code: 'CX1',
      name: 'Caixa 1',
      kind: 'CAIXA',
    });
    await organizations.bindThisDevice(ctx, { terminalId: id, version: 0 });
    const [item] = await organizations.listTerminals(ctx);
    expect(item).toMatchObject({ isThisDevice: true, hasDevice: true, deviceId: null });
  });
});
