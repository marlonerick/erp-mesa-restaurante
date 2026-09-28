import type { Database } from '@/shared/db/client';
import type { Transaction } from '@/shared/db/transaction';
import type { Clock, Id } from '@/shared/kernel';
import type { PasswordHasher } from '@/shared/security/password-hasher';

export type LoginMethod = 'PASSWORD' | 'PIN';

export type RevokeReason =
  | 'LOGOUT'
  | 'BLOQUEIO'
  | 'TROCA_USUARIO'
  | 'SENHA_ALTERADA'
  | 'SENHA_REDEFINIDA'
  | 'USUARIO_DESATIVADO';

export interface SessionRecord {
  readonly id: Id;
  readonly userId: Id;
  readonly organizationId: Id;
  readonly activeStoreId: Id;
  readonly deviceId: Id | null;
  readonly loginMethod: LoginMethod;
  readonly idleTimeoutSeconds: number;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface NewSession extends Omit<SessionRecord, 'revokedAt'> {
  readonly tokenHash: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface DeviceRecord {
  readonly id: Id;
  readonly shared: boolean;
}

export interface PurgeLimits {
  readonly sessionsEndedBefore: Date;
  readonly grantsCreatedBefore: Date;
  readonly rateLimitWindowsBefore: Date;
  readonly deviceUsersBefore: Date;
}

export interface AuthRepository {
  findSessionByTokenHash(tx: Transaction, tokenHash: string): Promise<SessionRecord | null>;
  insertSession(tx: Transaction, session: NewSession): Promise<void>;
  touchSession(tx: Transaction, sessionId: Id, now: Date): Promise<void>;
  revokeSession(tx: Transaction, sessionId: Id, reason: RevokeReason, now: Date): Promise<void>;
  revokeUserSessions(
    tx: Transaction,
    userId: Id,
    reason: RevokeReason,
    now: Date,
    exceptSessionId?: Id,
  ): Promise<void>;
  revokeDeviceSessions(
    tx: Transaction,
    deviceId: Id,
    reason: RevokeReason,
    now: Date,
  ): Promise<void>;

  findDeviceByTokenHash(tx: Transaction, tokenHash: string): Promise<DeviceRecord | null>;
  insertDevice(
    tx: Transaction,
    input: { id: Id; tokenHash: string; shared: boolean; now: Date },
  ): Promise<void>;
  updateDevice(tx: Transaction, id: Id, input: { shared: boolean; now: Date }): Promise<void>;
  upsertDeviceUser(tx: Transaction, deviceId: Id, userId: Id, now: Date): Promise<void>;
  /** Usuários que entraram COM SENHA no aparelho desde `since` (RN-AUTH-11). */
  listDeviceUserIds(tx: Transaction, deviceId: Id, since: Date): Promise<Id[]>;

  rateLimitHits(tx: Transaction, key: string, windowStart: Date): Promise<number>;
  rateLimitRegister(tx: Transaction, key: string, windowStart: Date): Promise<void>;
  rateLimitClear(tx: Transaction, key: string): Promise<void>;

  purge(tx: Transaction, limits: PurgeLimits): Promise<Record<string, number>>;
}

export interface AuthDependencies {
  readonly db: Database;
  readonly repo: AuthRepository;
  readonly hasher: PasswordHasher;
  readonly clock: Clock;
}

/** Dados da requisição HTTP usados na sessão e na auditoria. */
export interface RequestMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly requestId: string;
}
