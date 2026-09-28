import { describe, expect, it, vi } from 'vitest';
import type {
  AuthorizationRepository,
  RoleDefinition,
} from '@/modules/authorization/application/ports';
import { replaceStoreRoles } from '@/modules/authorization/application/role-assignment';
import type { Transaction } from '@/shared/db/transaction';
import { newId, PERMISSIONS, type Permission } from '@/shared/kernel';
import { FakeRequestContext } from '../../../support/request-context';

vi.mock('@/modules/audit', () => ({ recordAuditFromContext: vi.fn() }));

const role = (code: string, permissions: readonly Permission[]): RoleDefinition => ({
  id: newId(),
  code,
  permissions,
});

const ROLES = [
  role('ADMIN', [...PERMISSIONS]),
  role(
    'GERENTE',
    PERMISSIONS.filter((p) => p !== 'stores.manage'),
  ),
  role('CAIXA', ['orders.read', 'payments.create']),
  role('GARCOM', ['orders.read']),
  role('COZINHA', ['kds.read']),
];

function fakeRepo(currentCodes: string[]) {
  const insertAssignment = vi.fn(() => Promise.resolve());
  const deleteStoreAssignment = vi.fn(() => Promise.resolve());
  const repo = {
    findRolesByCodes: (_tx: Transaction, codes: readonly string[]) =>
      Promise.resolve(ROLES.filter((r) => codes.includes(r.code))),
    listStoreRoleCodes: () => Promise.resolve(currentCodes),
    insertAssignment,
    deleteStoreAssignment,
  };
  return {
    repo: repo as unknown as AuthorizationRepository,
    insertAssignment,
    deleteStoreAssignment,
  };
}

const tx = {} as Transaction;
const manager = new FakeRequestContext({ permissions: ROLES[1]?.permissions ?? [] });

describe('replaceStoreRoles — anti-escalada na inclusão E na remoção (RN-AUTHZ-05)', () => {
  it('gerente troca GARCOM por CAIXA', async () => {
    const { repo, insertAssignment, deleteStoreAssignment } = fakeRepo(['GARCOM']);
    await replaceStoreRoles(repo, tx, manager, newId(), ['CAIXA']);
    expect(insertAssignment).toHaveBeenCalledOnce();
    expect(deleteStoreAssignment).toHaveBeenCalledOnce();
  });

  it('gerente não INCLUI o perfil ADMIN', async () => {
    const { repo, insertAssignment, deleteStoreAssignment } = fakeRepo(['GARCOM']);
    await expect(
      replaceStoreRoles(repo, tx, manager, newId(), ['GARCOM', 'ADMIN']),
    ).rejects.toMatchObject({
      code: 'ROLE_ASSIGNMENT_NOT_ALLOWED',
    });
    expect(insertAssignment).not.toHaveBeenCalled();
    expect(deleteStoreAssignment).not.toHaveBeenCalled();
  });

  it('gerente não REMOVE um perfil ADMIN que outra pessoa deu', async () => {
    const { repo, insertAssignment, deleteStoreAssignment } = fakeRepo(['ADMIN', 'GARCOM']);
    await expect(replaceStoreRoles(repo, tx, manager, newId(), ['GARCOM'])).rejects.toMatchObject({
      code: 'ROLE_ASSIGNMENT_NOT_ALLOWED',
    });
    expect(deleteStoreAssignment).not.toHaveBeenCalled();
    expect(insertAssignment).not.toHaveBeenCalled();
  });

  it('perfil desconhecido é recusado', async () => {
    const { repo, insertAssignment, deleteStoreAssignment } = fakeRepo([]);
    await expect(replaceStoreRoles(repo, tx, manager, newId(), ['SUPER'])).rejects.toMatchObject({
      code: 'UNKNOWN_ROLE',
    });
    expect(insertAssignment).not.toHaveBeenCalled();
    expect(deleteStoreAssignment).not.toHaveBeenCalled();
  });
});
