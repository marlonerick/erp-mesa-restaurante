import { recordAudit } from '@/modules/audit';
import { grantOrganizationRole } from '@/modules/authorization';
import { createOrganizationWithStore, type NewOrganization } from '@/modules/organizations';
import type { Database } from '@/shared/db/client';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import { type Clock, DomainError, type Id, newId } from '@/shared/kernel';
import type { PasswordHasher } from '@/shared/security/password-hasher';
import { validateNewPassword } from '../domain/password-policy';
import { normalizeUsername } from '../domain/username';
import type { UserRepository } from './ports';

export interface FirstAdminInput extends NewOrganization {
  readonly adminName: string;
  readonly adminUsername: string;
  readonly adminPassword: string;
}

export interface BootstrapResult {
  readonly organizationId: Id;
  readonly storeId: Id;
  readonly adminId: Id;
}

/** Cria organização, empresa, loja e o ADMIN da organização, numa única transação. */
export async function createInitialAdmin(
  tx: Transaction,
  deps: { repo: UserRepository; clock: Clock },
  input: FirstAdminInput & { passwordHash: string; username: string },
): Promise<BootstrapResult> {
  const now = deps.clock.now();
  const { organizationId, storeId } = await createOrganizationWithStore(tx, input);
  const adminId = newId();
  await deps.repo.insert(tx, {
    id: adminId,
    organizationId,
    name: input.adminName.trim(),
    username: input.username,
    passwordHash: input.passwordHash,
    // A pessoa digitou a própria senha no comando: não é provisória
    mustChangePassword: false,
    passwordChangedAt: now,
    createdBy: null,
  });
  await grantOrganizationRole(tx, {
    userId: adminId,
    roleCode: 'ADMIN',
    organizationId,
    createdBy: null,
  });
  await recordAudit(tx, {
    event: 'USER_CREATED',
    occurredAt: now,
    organizationId,
    storeId,
    actorUserId: null,
    entityType: 'app_user',
    entityId: adminId,
    after: { name: input.adminName.trim(), username: input.username, via: 'admin:create' },
    ip: null,
    userAgent: 'terminal',
    requestId: null,
  });
  return { organizationId, storeId, adminId };
}

/**
 * Primeira instalação (decisão E2-5): só funciona com o banco SEM usuários — depois disso,
 * usuários são criados pela tela, com permissão e auditoria.
 */
export async function bootstrapFirstAdmin(
  deps: { db: Database; repo: UserRepository; hasher: PasswordHasher; clock: Clock },
  input: FirstAdminInput,
): Promise<BootstrapResult> {
  const username = normalizeUsername(input.adminUsername);
  validateNewPassword(input.adminPassword, username);
  const passwordHash = await deps.hasher.hash(input.adminPassword);
  return runInTransaction(deps.db, async (tx) => {
    if ((await deps.repo.countAll(tx)) > 0) {
      throw new DomainError(
        'ALREADY_INITIALIZED',
        'O sistema já tem usuários. Crie novos usuários pela tela de administração.',
        'CONFLICT',
      );
    }
    return createInitialAdmin(tx, deps, { ...input, username, passwordHash });
  });
}
