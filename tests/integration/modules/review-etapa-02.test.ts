// Achados da revisão da Etapa 2 (docs/weeks/etapa-02.md). Cada teste reproduz um problema
// encontrado pelo reviewer e deve continuar passando para sempre.
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { authService } from '@/modules/auth';
import { auditLog } from '@/shared/db/schema';
import { argon2Hasher, type PasswordHasher } from '@/shared/security/password-hasher';
import { useTestDatabase } from '../../support/database';
import { FakeClock } from '../../support/fake-clock';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  meta,
  TEST_START,
  testServices,
  uniqueUsername,
} from '../../support/identity';

const { db } = useTestDatabase();

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );

/** Hasher real que conta quantas conferências (verify) aconteceram. */
function countingHasher(): PasswordHasher & { verifications: number } {
  const hasher = {
    verifications: 0,
    hash: (secret: string) => argon2Hasher.hash(secret),
    verify: (stored: string, secret: string) => {
      hasher.verifications += 1;
      return argon2Hasher.verify(stored, secret);
    },
  };
  return hasher;
}

async function orgWithManager() {
  const services = testServices(db);
  const org = await createTestOrganization(db);
  const manager = uniqueUsername('gerente');
  await createTestUser(db, {
    organizationId: org.organizationId,
    username: manager,
    password: 'Gerente@2026',
    storeRoles: [{ role: 'GERENTE', storeId: org.centro }],
  });
  const { ctx } = await loginAs(services, manager, 'Gerente@2026');
  return { services, org, ctx };
}

describe('B1 — gerente não pode dominar quem está acima ou em outra loja', () => {
  it('gerente não redefine a senha nem desativa o ADMIN da organização', async () => {
    const { services, org, ctx } = await orgWithManager();
    const adminId = await createTestUser(db, {
      organizationId: org.organizationId,
      username: uniqueUsername('admin'),
      password: 'Admin@2026',
      organizationRole: 'ADMIN',
    });
    const notAllowed = { code: 'USER_MANAGEMENT_NOT_ALLOWED' };
    expect(
      await failureOf(
        services.users.resetPassword(ctx, { userId: adminId, temporaryPassword: 'Nova@2026' }),
      ),
    ).toMatchObject(notAllowed);
    expect(await failureOf(services.users.disable(ctx, { userId: adminId }))).toMatchObject(
      notAllowed,
    );
    expect(
      await failureOf(services.users.rename(ctx, { userId: adminId, name: 'Outro' })),
    ).toMatchObject(notAllowed);
  });

  it('gerente da loja Centro não mexe em quem também é gerente na loja Praia', async () => {
    const { services, org, ctx } = await orgWithManager();
    const target = await createTestUser(db, {
      organizationId: org.organizationId,
      username: uniqueUsername('duplo'),
      password: 'Duplo@2026',
      storeRoles: [
        { role: 'GARCOM', storeId: org.centro },
        { role: 'GERENTE', storeId: org.praia },
      ],
    });
    expect(
      await failureOf(
        services.users.resetPassword(ctx, { userId: target, temporaryPassword: 'Nova@2026' }),
      ),
    ).toMatchObject({ code: 'USER_MANAGEMENT_NOT_ALLOWED' });
    expect(
      await failureOf(services.users.setRoles(ctx, { userId: target, roleCodes: ['CAIXA'] })),
    ).toMatchObject({ code: 'USER_MANAGEMENT_NOT_ALLOWED' });
  });

  it('ADMIN da organização continua podendo gerenciar gerentes', async () => {
    const services = testServices(db);
    const org = await createTestOrganization(db);
    const admin = uniqueUsername('admin');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username: admin,
      password: 'Admin@2026',
      organizationRole: 'ADMIN',
    });
    const managerId = await createTestUser(db, {
      organizationId: org.organizationId,
      username: uniqueUsername('gerente'),
      password: 'Gerente@2026',
      storeRoles: [{ role: 'GERENTE', storeId: org.centro }],
    });
    const { ctx } = await loginAs(services, admin, 'Admin@2026');
    await expect(
      services.users.resetPassword(ctx, { userId: managerId, temporaryPassword: 'Nova@2026' }),
    ).resolves.toBeUndefined();
  });
});

describe('B2 — limite de tentativas vale para tentativas simultâneas', () => {
  it('20 senhas erradas ao mesmo tempo: no máximo 5 são conferidas', async () => {
    const org = await createTestOrganization(db);
    const username = uniqueUsername('alvo');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Certa@2026',
      storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
    });
    const hasher = countingHasher();
    const auth = authService({ db, hasher, clock: new FakeClock(TEST_START) });
    await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        auth.login(
          { username, password: `errada-${String(i)}`, sharedDevice: false, deviceToken: null },
          meta(),
        ),
      ),
    );
    expect(hasher.verifications).toBeLessThanOrEqual(5);
  });

  it('login certo não conta contra o limite do IP (restaurante inteiro sai pelo mesmo IP)', async () => {
    const org = await createTestOrganization(db);
    const username = uniqueUsername('equipe');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Equipe@2026',
      storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
    });
    const auth = authService({ db, clock: new FakeClock(TEST_START) });
    const ip = '203.0.113.9';
    for (let i = 0; i < 35; i += 1) {
      await auth.login(
        { username, password: 'Equipe@2026', sharedDevice: false, deviceToken: null },
        meta(ip),
      );
    }
  });
});

describe('I1 — travamento do PIN sob tentativas simultâneas', () => {
  it('20 PINs errados ao mesmo tempo: no máximo 5 são conferidos', async () => {
    const org = await createTestOrganization(db);
    const username = uniqueUsername('pin');
    const userId = await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Senha@2026',
      pin: '482915',
      storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
    });
    const hasher = countingHasher();
    const auth = authService({ db, hasher, clock: new FakeClock(TEST_START) });
    const { deviceToken } = await auth.login(
      { username, password: 'Senha@2026', sharedDevice: true, deviceToken: null },
      meta(),
    );
    hasher.verifications = 0;
    await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        auth.switchUser({ deviceToken, userId, pin: '000001' }, meta()),
      ),
    );
    expect(hasher.verifications).toBeLessThanOrEqual(5);
    expect(
      await failureOf(auth.switchUser({ deviceToken, userId, pin: '482915' }, meta())),
    ).toMatchObject({
      code: 'PIN_LOCKED',
    });
  });
});

describe('I2 — troca rápida só em aparelho compartilhado', () => {
  it('aparelho individual não lista usuários nem aceita PIN', async () => {
    const services = testServices(db);
    const org = await createTestOrganization(db);
    const username = uniqueUsername('individual');
    const userId = await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Senha@2026',
      pin: '482915',
      storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
    });
    const { deviceToken } = await loginAs(services, username, 'Senha@2026', {
      sharedDevice: false,
    });
    expect(await services.auth.listDeviceUsers(deviceToken)).toEqual([]);
    expect(
      await failureOf(services.auth.switchUser({ deviceToken, userId, pin: '482915' }, meta())),
    ).toMatchObject({ code: 'DEVICE_USER_NOT_ALLOWED' });
  });

  it('aparelho compartilhado continua compartilhado se alguém esquecer de marcar a caixa', async () => {
    const services = testServices(db);
    const org = await createTestOrganization(db);
    const [a, b] = [uniqueUsername('a'), uniqueUsername('b')];
    for (const username of [a, b]) {
      await createTestUser(db, {
        organizationId: org.organizationId,
        username,
        password: 'Senha@2026',
        pin: '482915',
        storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
      });
    }
    const { deviceToken } = await loginAs(services, a, 'Senha@2026', { sharedDevice: true });
    const second = await loginAs(services, b, 'Senha@2026', { sharedDevice: false, deviceToken });
    expect(second.session.sharedDevice).toBe(true);
  });
});

describe('I3 — auditoria descreve as mudanças de senha e PIN', () => {
  it('registra qual mudança aconteceu, sem o valor', async () => {
    const { services, org, ctx } = await orgWithManager();
    const username = uniqueUsername('alvo');
    const userId = await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Senha@2026',
      storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
    });
    await services.users.resetPassword(ctx, { userId, temporaryPassword: 'Nova@2026' });
    const own = await loginAs(services, username, 'Nova@2026');
    await services.auth.changeOwnPassword(own.ctx, {
      currentPassword: 'Nova@2026',
      newPassword: 'MinhaSenha#1',
    });
    const again = await loginAs(services, username, 'MinhaSenha#1');
    await services.auth.setOwnPin(again.ctx, { currentPassword: 'MinhaSenha#1', pin: '482915' });

    const rows = await db
      .select({ after: auditLog.afterData })
      .from(auditLog)
      .where(and(eq(auditLog.event, 'USER_UPDATED'), eq(auditLog.entityId, userId)));
    expect(
      rows.map((r) => r.after).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))),
    ).toEqual([{ change: 'OWN_PASSWORD' }, { change: 'OWN_PIN' }, { change: 'PASSWORD_RESET' }]);
  });
});

describe('I4 — senha atual não pode ser adivinhada sem limite', () => {
  it('depois de 5 senhas atuais erradas, recusa até a correta', async () => {
    const services = testServices(db);
    const org = await createTestOrganization(db);
    const username = uniqueUsername('adivinha');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Senha@2026',
      storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
    });
    const { ctx } = await loginAs(services, username, 'Senha@2026');
    for (let i = 0; i < 5; i += 1) {
      await failureOf(
        services.auth.setOwnPin(ctx, { currentPassword: `errada-${String(i)}`, pin: '482915' }),
      );
    }
    expect(
      await failureOf(
        services.auth.setOwnPin(ctx, { currentPassword: 'Senha@2026', pin: '482915' }),
      ),
    ).toMatchObject({ code: 'RATE_LIMITED' });
  });
});

describe('Sugestões aceitas', () => {
  it('autorização do gerente não revela se o usuário existe nem se o PIN estava errado', async () => {
    const { services, org } = await orgWithManager();
    const cashier = uniqueUsername('caixa');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username: cashier,
      password: 'Caixa@2026',
      storeRoles: [{ role: 'CAIXA', storeId: org.centro }],
    });
    const manager = uniqueUsername('gerente2');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username: manager,
      password: 'Gerente@2026',
      pin: '739104',
      storeRoles: [{ role: 'GERENTE', storeId: org.centro }],
    });
    const { ctx } = await loginAs(services, cashier, 'Caixa@2026');
    const ask = (authorizerUsername: string, pin: string) =>
      failureOf(
        services.auth.requestElevation(ctx, {
          authorizerUsername,
          pin,
          permission: 'orders.cancel',
        }),
      );
    const unknown = await ask(uniqueUsername('ninguem'), '739104');
    const wrongPin = await ask(manager, '000001');
    expect(unknown).toMatchObject({ code: 'INVALID_AUTHORIZATION' });
    expect(wrongPin).toMatchObject({ code: 'INVALID_AUTHORIZATION' });
  });

  it('gerente com senha provisória não autoriza', async () => {
    const { services, org } = await orgWithManager();
    const cashier = uniqueUsername('caixa');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username: cashier,
      password: 'Caixa@2026',
      storeRoles: [{ role: 'CAIXA', storeId: org.centro }],
    });
    const manager = uniqueUsername('provisorio');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username: manager,
      password: 'Gerente@2026',
      pin: '739104',
      mustChangePassword: true,
      storeRoles: [{ role: 'GERENTE', storeId: org.centro }],
    });
    const { ctx } = await loginAs(services, cashier, 'Caixa@2026');
    expect(
      await failureOf(
        services.auth.requestElevation(ctx, {
          authorizerUsername: manager,
          pin: '739104',
          permission: 'orders.cancel',
        }),
      ),
    ).toMatchObject({ code: 'AUTHORIZER_NOT_ALLOWED' });
  });

  it('texto que não é nome de usuário não vai para a auditoria (pode ser uma senha digitada no campo errado)', async () => {
    const services = testServices(db);
    const typedPassword = `Minha Senha ${uniqueUsername('x')}!`;
    await failureOf(
      services.auth.login(
        { username: typedPassword, password: 'x', sharedDevice: false, deviceToken: null },
        meta(),
      ),
    );
    const rows = await db
      .select({ entityId: auditLog.entityId, after: auditLog.afterData })
      .from(auditLog);
    expect(JSON.stringify(rows)).not.toContain(typedPassword.toLowerCase());
  });
});
