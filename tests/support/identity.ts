import { authService } from '@/modules/auth';
import { catalogService } from '@/modules/catalog';
import { inventoryService } from '@/modules/inventory';
import {
  grantOrganizationRole,
  grantStoreRoleUnchecked,
  storeAccess,
} from '@/modules/authorization';
import {
  addStore,
  createOrganizationWithStore,
  organizationAdministration,
} from '@/modules/organizations';
import { ordersService } from '@/modules/orders';
import { recipesService } from '@/modules/recipes';
import { tablesService } from '@/modules/tables';
import { insertUser, storePinHash, userAdministration } from '@/modules/users';
import type { Database } from '@/shared/db/client';
import { runInTransaction } from '@/shared/db/transaction';
import { type Id, newId, type SystemRole } from '@/shared/kernel';
import { argon2Hasher } from '@/shared/security/password-hasher';
import { FakeClock } from './fake-clock';

/** 18:00 em São Paulo (21:00 UTC). */
export const TEST_START = new Date('2026-03-14T21:00:00.000Z');

const octet = () => String(Math.floor(Math.random() * 250) + 1);

/**
 * Dados da requisição. IP aleatório por padrão: o limite de 30 falhas por IP (RN-AUTH-04) não
 * pode vazar de um teste para outro, já que o banco é compartilhado.
 */
export const meta = (ip = `10.${octet()}.${octet()}.${octet()}`) => ({
  ip,
  userAgent: 'vitest',
  requestId: 'req-test',
});

/** Nome de usuário único por teste (o banco é compartilhado entre os testes). */
export function uniqueUsername(base: string): string {
  return `${base}.${Math.random().toString(36).slice(2, 8)}`;
}

export interface TestOrganization {
  readonly organizationId: Id;
  readonly companyId: Id;
  readonly centro: Id;
  readonly praia: Id;
}

export async function createTestOrganization(db: Database): Promise<TestOrganization> {
  return runInTransaction(db, async (tx) => {
    const { organizationId, companyId, storeId } = await createOrganizationWithStore(tx, {
      organizationName: 'Restaurante Teste',
      companyLegalName: 'Restaurante Teste Ltda',
      companyTradeName: 'Restaurante Teste',
      cnpj: null,
      storeName: 'Centro',
      storeCode: 'CENTRO',
    });
    const praia = await addStore(tx, { organizationId, companyId, name: 'Praia', code: 'PRAIA' });
    return { organizationId, companyId, centro: storeId, praia };
  });
}

export interface TestUserInput {
  readonly organizationId: Id;
  readonly username: string;
  readonly password: string;
  readonly name?: string;
  readonly pin?: string;
  readonly mustChangePassword?: boolean;
  readonly storeRoles?: readonly { role: SystemRole; storeId: Id }[];
  readonly organizationRole?: SystemRole;
}

export async function createTestUser(db: Database, input: TestUserInput): Promise<Id> {
  const id = newId();
  const passwordHash = await argon2Hasher.hash(input.password);
  const pinHash = input.pin ? await argon2Hasher.hash(input.pin) : null;
  await runInTransaction(db, async (tx) => {
    await insertUser(tx, {
      id,
      organizationId: input.organizationId,
      name: input.name ?? input.username,
      username: input.username,
      passwordHash,
      mustChangePassword: input.mustChangePassword ?? false,
      passwordChangedAt: TEST_START,
      createdBy: null,
    });
    if (pinHash) await storePinHash(tx, id, pinHash);
    for (const { role, storeId } of input.storeRoles ?? []) {
      await grantStoreRoleUnchecked(tx, { userId: id, roleCode: role, storeId });
    }
    if (input.organizationRole) {
      await grantOrganizationRole(tx, {
        userId: id,
        roleCode: input.organizationRole,
        organizationId: input.organizationId,
        createdBy: null,
      });
    }
  });
  return id;
}

/** Serviços reais ligados ao banco de teste e a um relógio controlável. */
export function testServices(db: Database, clock = new FakeClock(TEST_START)) {
  const auth = authService({ db, clock });
  const users = userAdministration({ db, revokeUserSessions: auth.revokeUserSessions });
  const organizations = organizationAdministration({ db, access: storeAccess });
  const catalog = catalogService({ db });
  const inventory = inventoryService({ db });
  const recipes = recipesService({ db });
  const tables = tablesService({ db });
  const orders = ordersService({ db });
  return { auth, users, organizations, catalog, inventory, recipes, tables, orders, clock };
}

/** Entra com senha e devolve o contexto da requisição, como o servidor faria. */
export async function loginAs(
  services: ReturnType<typeof testServices>,
  username: string,
  password: string,
  options: { sharedDevice?: boolean; deviceToken?: string | null } = {},
) {
  const result = await services.auth.login(
    {
      username,
      password,
      sharedDevice: options.sharedDevice ?? false,
      deviceToken: options.deviceToken ?? null,
    },
    meta(),
  );
  const session = await services.auth.authenticate(result.sessionToken, meta());
  if (!session) throw new Error('sessão não criada');
  return { ...result, session, ctx: session.context };
}
