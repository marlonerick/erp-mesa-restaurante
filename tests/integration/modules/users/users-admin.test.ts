import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { grantStoreRoleUnchecked } from '@/modules/authorization';
import { auditLog } from '@/shared/db/schema';
import { runInTransaction } from '@/shared/db/transaction';
import { useTestDatabase } from '../../../support/database';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  meta,
  testServices,
  uniqueUsername,
} from '../../../support/identity';

const { db } = useTestDatabase();

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );

async function managerScenario() {
  const services = testServices(db);
  const org = await createTestOrganization(db);
  const manager = uniqueUsername('gerente');
  const managerId = await createTestUser(db, {
    organizationId: org.organizationId,
    username: manager,
    password: 'Gerente@2026',
    storeRoles: [{ role: 'GERENTE', storeId: org.centro }],
  });
  const { ctx } = await loginAs(services, manager, 'Gerente@2026');
  const waiter = uniqueUsername('garcom');
  const waiterId = await createTestUser(db, {
    organizationId: org.organizationId,
    username: waiter,
    password: 'Garcom@2026',
    pin: '482915',
    storeRoles: [{ role: 'GARCOM', storeId: org.centro }],
  });
  return { services, org, ctx, managerId, waiter, waiterId };
}

describe('administração de usuários', () => {
  it('renomear audita o antes e o depois', async () => {
    const { services, ctx, waiterId } = await managerScenario();
    await services.users.rename(ctx, { userId: waiterId, name: '  João   da Silva ' });
    const [row] = await db
      .select({ after: auditLog.afterData })
      .from(auditLog)
      .where(and(eq(auditLog.event, 'USER_UPDATED'), eq(auditLog.entityId, waiterId)));
    expect(row?.after).toEqual({ name: 'João da Silva' });
  });

  it('trocar perfis na loja audita ROLE_CHANGED e vale no próximo acesso', async () => {
    const { services, ctx, waiter, waiterId } = await managerScenario();
    await services.users.setRoles(ctx, { userId: waiterId, roleCodes: ['CAIXA', 'GARCOM'] });
    const { ctx: waiterCtx } = await loginAs(services, waiter, 'Garcom@2026');
    expect(waiterCtx.permissions.has('payments.create')).toBe(true);
    const [row] = await db
      .select({ before: auditLog.beforeData, after: auditLog.afterData })
      .from(auditLog)
      .where(and(eq(auditLog.event, 'ROLE_CHANGED'), eq(auditLog.entityId, waiterId)));
    expect(row).toEqual({ before: { roles: ['GARCOM'] }, after: { roles: ['CAIXA', 'GARCOM'] } });
  });

  it('gerente não remove um perfil que ele mesmo não poderia dar (anti-escalada)', async () => {
    const { services, org, ctx, waiterId } = await managerScenario();
    await runInTransaction(db, (tx) =>
      grantStoreRoleUnchecked(tx, { userId: waiterId, roleCode: 'ADMIN', storeId: org.centro }),
    );
    expect(
      await failureOf(services.users.setRoles(ctx, { userId: waiterId, roleCodes: ['GARCOM'] })),
    ).toMatchObject({ code: 'ROLE_ASSIGNMENT_NOT_ALLOWED' });
  });

  it('ninguém altera os próprios perfis nem desativa a si mesmo', async () => {
    const { services, ctx, managerId } = await managerScenario();
    expect(
      await failureOf(services.users.setRoles(ctx, { userId: managerId, roleCodes: ['GERENTE'] })),
    ).toMatchObject({ code: 'CANNOT_CHANGE_OWN_ROLES' });
    expect(await failureOf(services.users.disable(ctx, { userId: managerId }))).toMatchObject({
      code: 'CANNOT_DISABLE_SELF',
    });
  });

  it('redefinir a senha encerra as sessões, exige troca e destrava o PIN', async () => {
    const { services, ctx, waiter, waiterId } = await managerScenario();
    const { sessionToken } = await loginAs(services, waiter, 'Garcom@2026');
    await services.users.resetPassword(ctx, { userId: waiterId, temporaryPassword: 'Nova@2026' });

    expect(await services.auth.authenticate(sessionToken, meta())).toBeNull();
    const again = await loginAs(services, waiter, 'Nova@2026');
    expect(again.mustChangePassword).toBe(true);
  });

  it('gerente da loja Centro não altera, redefine nem desativa usuário só da Praia (isolamento)', async () => {
    const { services, org, ctx } = await managerScenario();
    const rui = await createTestUser(db, {
      organizationId: org.organizationId,
      username: uniqueUsername('rui'),
      password: 'Garcom@2026',
      storeRoles: [{ role: 'GARCOM', storeId: org.praia }],
    });
    const notFound = { code: 'USER_NOT_FOUND' };
    expect(
      await failureOf(services.users.rename(ctx, { userId: rui, name: 'Outro' })),
    ).toMatchObject(notFound);
    expect(
      await failureOf(
        services.users.resetPassword(ctx, { userId: rui, temporaryPassword: 'Nova@2026' }),
      ),
    ).toMatchObject(notFound);
    expect(await failureOf(services.users.disable(ctx, { userId: rui }))).toMatchObject(notFound);
    expect(
      await failureOf(services.users.setRoles(ctx, { userId: rui, roleCodes: ['CAIXA'] })),
    ).toMatchObject(notFound);
  });

  it('cadastro valida nome, usuário, senha provisória e perfis', async () => {
    const { services, ctx } = await managerScenario();
    const create = (input: Partial<Parameters<typeof services.users.create>[1]>) =>
      failureOf(
        services.users.create(ctx, {
          name: 'Pessoa',
          username: uniqueUsername('pessoa'),
          temporaryPassword: 'Inicio2026',
          roleCodes: ['GARCOM'],
          ...input,
        }),
      );
    expect(await create({ name: 'A' })).toMatchObject({ code: 'INVALID_NAME' });
    expect(await create({ username: 'joão' })).toMatchObject({ code: 'INVALID_USERNAME' });
    expect(await create({ temporaryPassword: 'curta' })).toMatchObject({ code: 'WEAK_PASSWORD' });
    expect(await create({ roleCodes: [] })).toMatchObject({ code: 'ROLE_REQUIRED' });
    expect(await create({ roleCodes: ['SUPERUSUARIO'] })).toMatchObject({ code: 'UNKNOWN_ROLE' });
  });

  it('dois cadastros simultâneos com o mesmo usuário: só um entra', async () => {
    const { services, ctx } = await managerScenario();
    const username = uniqueUsername('duplo');
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        services.users.create(ctx, {
          name: 'Duplo',
          username,
          temporaryPassword: 'Inicio2026',
          roleCodes: ['GARCOM'],
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'USERNAME_TAKEN' },
    });
  });
});
