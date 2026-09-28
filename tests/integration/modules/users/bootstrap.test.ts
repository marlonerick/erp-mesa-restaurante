import { describe, expect, it } from 'vitest';
import { bootstrapFirstAdmin } from '@/modules/users';
import { createInitialAdmin } from '@/modules/users/application/bootstrap';
import { userRepository } from '@/modules/users/infrastructure/user-repository';
import { runInTransaction } from '@/shared/db/transaction';
import { PERMISSIONS } from '@/shared/kernel';
import { argon2Hasher } from '@/shared/security/password-hasher';
import { useTestDatabase } from '../../../support/database';
import { FakeClock } from '../../../support/fake-clock';
import {
  createTestOrganization,
  createTestUser,
  loginAs,
  TEST_START,
  testServices,
  uniqueUsername,
} from '../../../support/identity';

const { db } = useTestDatabase();

const organization = {
  organizationName: 'Cantina Nova',
  companyLegalName: 'Cantina Nova Ltda',
  companyTradeName: 'Cantina Nova',
  cnpj: null,
  storeName: 'Matriz',
  storeCode: 'MATRIZ',
};

describe('primeira instalação (E2-5)', () => {
  it('recusa quando o sistema já tem usuários', async () => {
    const org = await createTestOrganization(db);
    await createTestUser(db, {
      organizationId: org.organizationId,
      username: uniqueUsername('existente'),
      password: 'Senha@2026',
    });
    await expect(
      bootstrapFirstAdmin(
        { ...organization, adminName: 'Dona', adminUsername: 'dona', adminPassword: 'Dona@2026' },
        { db },
      ),
    ).rejects.toMatchObject({ code: 'ALREADY_INITIALIZED' });
  });

  it('cria organização, loja e um ADMIN que vale em todas as lojas', async () => {
    const username = uniqueUsername('dona');
    await runInTransaction(db, (tx) =>
      createInitialAdmin(
        tx,
        { repo: userRepository, clock: new FakeClock(TEST_START) },
        {
          ...organization,
          adminName: 'Dona',
          adminUsername: username,
          adminPassword: 'Dona@2026',
          username,
          passwordHash: '',
        },
      ).then(async (result) => {
        await userRepository.updatePassword(tx, result.adminId, {
          passwordHash: await argon2Hasher.hash('Dona@2026'),
          mustChangePassword: false,
          changedAt: TEST_START,
        });
      }),
    );

    const { ctx, session } = await loginAs(testServices(db), username, 'Dona@2026');
    expect(session.storeName).toBe('Matriz');
    expect([...ctx.permissions].sort()).toEqual([...PERMISSIONS].sort());
  });
});
