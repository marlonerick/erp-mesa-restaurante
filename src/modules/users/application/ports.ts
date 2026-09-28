import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { PasswordHasher } from '@/shared/security/password-hasher';
import type { Id } from '@/shared/kernel';

export type UserStatus = 'ATIVO' | 'DESATIVADO';

export interface UserRecord {
  readonly id: Id;
  readonly organizationId: Id;
  readonly name: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly pinHash: string | null;
  readonly status: UserStatus;
  readonly mustChangePassword: boolean;
  readonly failedPinAttempts: number;
  readonly pinLockedAt: Date | null;
}

export interface NewUser {
  readonly id: Id;
  readonly organizationId: Id;
  readonly name: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly mustChangePassword: boolean;
  readonly passwordChangedAt: Date;
  readonly createdBy: Id | null;
}

export interface UserRepository {
  findByUsername(tx: Transaction, username: string): Promise<UserRecord | null>;
  findById(tx: Transaction, id: Id): Promise<UserRecord | null>;
  findManyByIds(tx: Transaction, ids: readonly Id[]): Promise<UserRecord[]>;
  countAll(tx: Transaction): Promise<number>;
  insert(tx: Transaction, user: NewUser): Promise<void>;
  updateName(tx: Transaction, id: Id, name: string): Promise<void>;
  updatePassword(
    tx: Transaction,
    id: Id,
    input: { passwordHash: string; mustChangePassword: boolean; changedAt: Date },
  ): Promise<void>;
  updatePin(tx: Transaction, id: Id, pinHash: string): Promise<void>;
  /** Soma uma falha de PIN e trava ao chegar no limite; devolve a situação atualizada. */
  registerPinFailure(
    tx: Transaction,
    id: Id,
    input: { now: Date; maxAttempts: number },
  ): Promise<{ attempts: number; locked: boolean }>;
  clearPinFailures(tx: Transaction, id: Id): Promise<void>;
  disable(tx: Transaction, id: Id, now: Date): Promise<void>;
}

/** Encerrar sessões pertence ao módulo Auth; é injetado para evitar dependência circular. */
export type RevokeUserSessions = (
  tx: Transaction,
  userId: Id,
  reason: 'USUARIO_DESATIVADO' | 'SENHA_REDEFINIDA',
  now: Date,
) => Promise<void>;

export interface UsersDependencies {
  readonly db: Database;
  readonly repo: UserRepository;
  readonly hasher: PasswordHasher;
  readonly revokeUserSessions: RevokeUserSessions;
}
