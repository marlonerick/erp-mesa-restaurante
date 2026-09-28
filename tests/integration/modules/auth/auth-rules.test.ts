import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { authorizeOrElevate } from '@/modules/authorization';
import { appUser, auditLog, deviceUser, userSession } from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
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

const { db } = useTestDatabase();
const DAY = 24 * 60 * 60 * 1000;

async function scenario(options: { pin?: string; role?: 'GARCOM' | 'GERENTE' | 'CAIXA' } = {}) {
  const clock = new FakeClock(TEST_START);
  const services = testServices(db, clock);
  const org = await createTestOrganization(db);
  const username = uniqueUsername('usuario');
  const userId = await createTestUser(db, {
    organizationId: org.organizationId,
    username,
    password: 'Senha@2026',
    ...(options.pin ? { pin: options.pin } : {}),
    storeRoles: [{ role: options.role ?? 'GARCOM', storeId: org.centro }],
  });
  return { clock, services, org, username, userId };
}

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );

describe('login — regras de borda', () => {
  it('usuário desativado recebe a mesma mensagem de senha errada', async () => {
    const { services, username, userId, org } = await scenario();
    const manager = uniqueUsername('gerente');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username: manager,
      password: 'Gerente@2026',
      storeRoles: [{ role: 'GERENTE', storeId: org.centro }],
    });
    const { ctx } = await loginAs(services, manager, 'Gerente@2026');
    await services.users.disable(ctx, { userId });

    const error = await failureOf(loginAs(services, username, 'Senha@2026'));
    expect(error).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('usuário sem perfil em nenhuma loja é recusado depois de conferir a senha', async () => {
    const org = await createTestOrganization(db);
    const username = uniqueUsername('semloja');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Senha@2026',
    });
    const error = await failureOf(loginAs(testServices(db), username, 'Senha@2026'));
    expect(error).toMatchObject({ code: 'NO_STORE_ACCESS' });
  });

  it('30 falhas do mesmo IP bloqueiam qualquer usuário daquele IP', async () => {
    const { services, username } = await scenario();
    const ip = '192.0.2.77';
    for (let i = 0; i < 30; i += 1) {
      await failureOf(
        services.auth.login(
          {
            username: uniqueUsername('x'),
            password: 'errada',
            sharedDevice: false,
            deviceToken: null,
          },
          meta(ip),
        ),
      );
    }
    const error = await failureOf(
      services.auth.login(
        { username, password: 'Senha@2026', sharedDevice: false, deviceToken: null },
        meta(ip),
      ),
    );
    expect(error).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('o bloqueio termina quando a janela de 15 minutos passa', async () => {
    const { services, username, clock } = await scenario();
    for (let i = 0; i < 5; i += 1) {
      await failureOf(loginAs(services, username, 'errada'));
    }
    expect(await failureOf(loginAs(services, username, 'Senha@2026'))).toMatchObject({
      code: 'RATE_LIMITED',
    });
    clock.advanceMinutes(15);
    expect(await failureOf(loginAs(services, username, 'Senha@2026'))).toBeNull();
  });

  it('entrar com a senha destrava o PIN (RN-AUTH-12)', async () => {
    const { services, username, userId } = await scenario({ pin: '482915' });
    const { deviceToken } = await loginAs(services, username, 'Senha@2026', { sharedDevice: true });
    for (let i = 0; i < 5; i += 1) {
      await failureOf(services.auth.switchUser({ deviceToken, userId, pin: '000001' }, meta()));
    }
    expect(
      await failureOf(services.auth.switchUser({ deviceToken, userId, pin: '482915' }, meta())),
    ).toMatchObject({ code: 'PIN_LOCKED' });

    await loginAs(services, username, 'Senha@2026', { sharedDevice: true, deviceToken });
    await expect(
      services.auth.switchUser({ deviceToken, userId, pin: '482915' }, meta()),
    ).resolves.toHaveProperty('sessionToken');
  });
});

describe('troca de turno: muitos logins ao mesmo tempo', () => {
  it('20 pessoas entrando simultaneamente em aparelhos novos: todas conseguem (sem deadlock)', async () => {
    const org = await createTestOrganization(db);
    const usernames = Array.from({ length: 20 }, () => uniqueUsername('turno'));
    for (const username of usernames) {
      await createTestUser(db, {
        organizationId: org.organizationId,
        username,
        password: 'Turno@2026',
        storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
      });
    }
    const services = testServices(db);
    const results = await Promise.allSettled(
      usernames.map((username) => loginAs(services, username, 'Turno@2026')),
    );
    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures).toEqual([]);
  });
});

describe('troca rápida — regras de borda', () => {
  it('quem entrou com senha há mais de 7 dias não pode trocar por PIN', async () => {
    const { services, username, userId, clock } = await scenario({ pin: '482915' });
    const { deviceToken } = await loginAs(services, username, 'Senha@2026', { sharedDevice: true });
    clock.advanceHours(7 * 24 + 1);
    expect(await services.auth.listDeviceUsers(deviceToken)).toEqual([]);
    expect(
      await failureOf(services.auth.switchUser({ deviceToken, userId, pin: '482915' }, meta())),
    ).toMatchObject({ code: 'DEVICE_USER_NOT_ALLOWED' });
  });

  it('usuário sem PIN não aparece na lista do aparelho', async () => {
    const { services, username } = await scenario();
    const { deviceToken } = await loginAs(services, username, 'Senha@2026', { sharedDevice: true });
    expect(await services.auth.listDeviceUsers(deviceToken)).toEqual([]);
  });
});

describe('sessão, saída e bloqueio de tela', () => {
  it('sair encerra a sessão e audita LOGOUT', async () => {
    const { services, username, userId } = await scenario();
    const { sessionToken } = await loginAs(services, username, 'Senha@2026');
    await services.auth.logout(sessionToken, meta());
    expect(await services.auth.authenticate(sessionToken, meta())).toBeNull();
    const [row] = await db
      .select({ after: auditLog.afterData })
      .from(auditLog)
      .where(and(eq(auditLog.actorUserId, userId), eq(auditLog.event, 'LOGOUT')));
    expect(row?.after).toEqual({ reason: 'LOGOUT' });
  });

  it('bloquear a tela encerra a sessão com o motivo BLOQUEIO', async () => {
    const { services, username } = await scenario();
    const { sessionToken } = await loginAs(services, username, 'Senha@2026', {
      sharedDevice: true,
    });
    await services.auth.lockScreen(sessionToken, meta());
    const [row] = await db
      .select({ reason: userSession.revokeReason })
      .from(userSession)
      .where(eq(userSession.revokeReason, 'BLOQUEIO'));
    expect(row?.reason).toBe('BLOQUEIO');
    expect(await services.auth.authenticate(sessionToken, meta())).toBeNull();
  });

  it('consultas automáticas (touch: false) não renovam o tempo de uso (RN-AUTH-15)', async () => {
    const { services, username, clock } = await scenario();
    const { sessionToken } = await loginAs(services, username, 'Senha@2026', {
      sharedDevice: true,
    });
    for (let i = 0; i < 4; i += 1) {
      clock.advanceMinutes(1);
      await services.auth.authenticate(sessionToken, meta(), { touch: false });
    }
    // 4 min sem ação do usuário em aparelho compartilhado: encerrada
    expect(await services.auth.authenticate(sessionToken, meta())).toBeNull();
  });

  it('uso real renova o tempo em aparelho compartilhado', async () => {
    const { services, username, clock } = await scenario();
    const { sessionToken } = await loginAs(services, username, 'Senha@2026', {
      sharedDevice: true,
    });
    for (let i = 0; i < 10; i += 1) {
      clock.advanceMinutes(2);
      expect(await services.auth.authenticate(sessionToken, meta())).not.toBeNull();
    }
  });
});

describe('senha e PIN do próprio usuário', () => {
  it('trocar a senha provisória libera as permissões e encerra as outras sessões', async () => {
    const org = await createTestOrganization(db);
    const username = uniqueUsername('novo');
    await createTestUser(db, {
      organizationId: org.organizationId,
      username,
      password: 'Provisoria1',
      mustChangePassword: true,
      storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
    });
    const services = testServices(db);
    const other = await loginAs(services, username, 'Provisoria1');
    const current = await loginAs(services, username, 'Provisoria1');
    expect(current.ctx.permissions.size).toBe(0);

    await services.auth.changeOwnPassword(current.ctx, {
      currentPassword: 'Provisoria1',
      newPassword: 'MinhaSenha#1',
    });

    const after = await services.auth.authenticate(current.sessionToken, meta());
    expect(after?.mustChangePassword).toBe(false);
    expect(after?.context.permissions.has('orders.create')).toBe(true);
    expect(await services.auth.authenticate(other.sessionToken, meta())).toBeNull();
  });

  it('recusa troca com a senha atual errada ou nova senha fraca', async () => {
    const { services, username } = await scenario();
    const { ctx } = await loginAs(services, username, 'Senha@2026');
    expect(
      await failureOf(
        services.auth.changeOwnPassword(ctx, { currentPassword: 'x', newPassword: 'NovaSenha#1' }),
      ),
    ).toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' });
    expect(
      await failureOf(
        services.auth.changeOwnPassword(ctx, {
          currentPassword: 'Senha@2026',
          newPassword: '12345678',
        }),
      ),
    ).toMatchObject({ code: 'WEAK_PASSWORD' });
  });

  it('cadastrar PIN exige a senha e um PIN válido', async () => {
    const { services, username } = await scenario();
    const { ctx } = await loginAs(services, username, 'Senha@2026');
    expect(
      await failureOf(
        services.auth.setOwnPin(ctx, { currentPassword: 'Senha@2026', pin: '123456' }),
      ),
    ).toMatchObject({ code: 'INVALID_PIN_FORMAT' });
    expect(
      await failureOf(services.auth.setOwnPin(ctx, { currentPassword: 'errada', pin: '482915' })),
    ).toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' });
    await expect(
      services.auth.setOwnPin(ctx, { currentPassword: 'Senha@2026', pin: '482915' }),
    ).resolves.toBeUndefined();
  });
});

describe('autorização do gerente — regras de borda', () => {
  async function elevationScenario() {
    const base = await scenario({ role: 'CAIXA' });
    const manager = uniqueUsername('gerente');
    await createTestUser(db, {
      organizationId: base.org.organizationId,
      username: manager,
      password: 'Gerente@2026',
      pin: '739104',
      storeRoles: [{ role: 'GERENTE', storeId: base.org.centro }],
    });
    const cashier = await loginAs(base.services, base.username, 'Senha@2026');
    return { ...base, manager, cashier };
  }

  it('não vale em outra sessão nem para outra permissão', async () => {
    const { services, manager, cashier, username } = await elevationScenario();
    const { grantToken } = await services.auth.requestElevation(cashier.ctx, {
      authorizerUsername: manager,
      pin: '739104',
      permission: 'orders.cancel',
    });
    const otherSession = await loginAs(services, username, 'Senha@2026');
    const use = (ctx: typeof cashier.ctx, permission: 'orders.cancel' | 'payments.cancel') =>
      failureOf(runInTransaction(db, (tx) => authorizeOrElevate(tx, ctx, permission, grantToken)));

    expect(await use(otherSession.ctx, 'orders.cancel')).toMatchObject({
      code: 'ELEVATED_GRANT_INVALID',
    });
    expect(await use(cashier.ctx, 'payments.cancel')).toMatchObject({
      code: 'ELEVATED_GRANT_INVALID',
    });
    expect(await use(cashier.ctx, 'orders.cancel')).toBeNull();
  });

  it('PIN errado do gerente é recusado e conta para o travamento', async () => {
    const { services, manager, cashier } = await elevationScenario();
    const ask = (pin: string) =>
      failureOf(
        services.auth.requestElevation(cashier.ctx, {
          authorizerUsername: manager,
          pin,
          permission: 'orders.cancel',
        }),
      );
    // Mensagem genérica: não revela se o usuário existe (sugestão 1 da revisão)
    expect(await ask('000001')).toMatchObject({ code: 'INVALID_AUTHORIZATION' });
    for (let i = 0; i < 4; i += 1) await ask('000001');
    // Travou, mas a resposta continua genérica (não revela o estado do PIN — sugestão 4)
    expect(await ask('739104')).toMatchObject({ code: 'INVALID_AUTHORIZATION' });
    const [row] = await db
      .select({ lockedAt: appUser.pinLockedAt })
      .from(appUser)
      .where(eq(appUser.username, manager));
    expect(row?.lockedAt).not.toBeNull();
  });

  it('gerente de outra organização não autoriza', async () => {
    const { services, cashier } = await elevationScenario();
    const otherOrg = await createTestOrganization(db);
    const outsider = uniqueUsername('outro');
    await createTestUser(db, {
      organizationId: otherOrg.organizationId,
      username: outsider,
      password: 'Gerente@2026',
      pin: '739104',
      storeRoles: [{ role: 'GERENTE', storeId: otherOrg.centro }],
    });
    expect(
      await failureOf(
        services.auth.requestElevation(cashier.ctx, {
          authorizerUsername: outsider,
          pin: '739104',
          permission: 'orders.cancel',
        }),
      ),
    ).toMatchObject({ code: 'INVALID_AUTHORIZATION' });
  });

  it('sem autorização e sem permissão: FORBIDDEN', async () => {
    const { cashier } = await elevationScenario();
    expect(
      await failureOf(
        runInTransaction(db, (tx) => authorizeOrElevate(tx, cashier.ctx, 'orders.cancel', null)),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('limpeza periódica (Q-13b)', () => {
  it('apaga sessões antigas e vínculos de aparelho, mas NUNCA a auditoria', async () => {
    const { services, username, userId, clock } = await scenario();
    const { sessionToken } = await loginAs(services, username, 'Senha@2026');
    await services.auth.logout(sessionToken, meta());
    const auditBefore = await db.select().from(auditLog).where(eq(auditLog.actorUserId, userId));

    clock.set(new Date(TEST_START.getTime() + 91 * DAY));
    const removed = await services.auth.purgeExpiredData();

    expect(removed.sessoes).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(userSession).where(eq(userSession.userId, userId))).toEqual([]);
    expect(await db.select().from(deviceUser).where(eq(deviceUser.userId, userId))).toEqual([]);
    expect(await db.select().from(auditLog).where(eq(auditLog.actorUserId, userId))).toHaveLength(
      auditBefore.length,
    );
  });
});
