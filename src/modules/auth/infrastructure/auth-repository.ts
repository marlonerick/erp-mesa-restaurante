import { and, eq, gte, isNull, lt, ne, or, sql } from 'drizzle-orm';
import {
  deviceUser,
  elevatedGrant,
  knownDevice,
  rateLimitBucket,
  userSession,
} from '@/shared/db/schema';
import type { AuthRepository } from '../application/ports';

const sessionColumns = {
  id: userSession.id,
  userId: userSession.userId,
  organizationId: userSession.organizationId,
  activeStoreId: userSession.activeStoreId,
  deviceId: userSession.deviceId,
  loginMethod: userSession.loginMethod,
  idleTimeoutSeconds: userSession.idleTimeoutSeconds,
  createdAt: userSession.createdAt,
  lastSeenAt: userSession.lastSeenAt,
  expiresAt: userSession.expiresAt,
  revokedAt: userSession.revokedAt,
};

export const authRepository: AuthRepository = {
  async findSessionByTokenHash(tx, tokenHash) {
    const [row] = await tx
      .select(sessionColumns)
      .from(userSession)
      .where(eq(userSession.tokenHash, tokenHash));
    return row ?? null;
  },

  async insertSession(tx, session) {
    await tx
      .insert(userSession)
      .values({ ...session, userAgent: session.userAgent?.slice(0, 255) });
  },

  async touchSession(tx, sessionId, now) {
    await tx.update(userSession).set({ lastSeenAt: now }).where(eq(userSession.id, sessionId));
  },

  async revokeSession(tx, sessionId, reason, now) {
    await tx
      .update(userSession)
      .set({ revokedAt: now, revokeReason: reason })
      .where(and(eq(userSession.id, sessionId), isNull(userSession.revokedAt)));
  },

  async revokeUserSessions(tx, userId, reason, now, exceptSessionId) {
    await tx
      .update(userSession)
      .set({ revokedAt: now, revokeReason: reason })
      .where(
        and(
          eq(userSession.userId, userId),
          isNull(userSession.revokedAt),
          exceptSessionId ? ne(userSession.id, exceptSessionId) : undefined,
        ),
      );
  },

  async revokeDeviceSessions(tx, deviceId, reason, now) {
    await tx
      .update(userSession)
      .set({ revokedAt: now, revokeReason: reason })
      .where(and(eq(userSession.deviceId, deviceId), isNull(userSession.revokedAt)));
  },

  async findDeviceByTokenHash(tx, tokenHash) {
    const [row] = await tx
      .select({ id: knownDevice.id, shared: knownDevice.shared })
      .from(knownDevice)
      .where(eq(knownDevice.tokenHash, tokenHash));
    return row ?? null;
  },

  async insertDevice(tx, { id, tokenHash, shared, now }) {
    await tx.insert(knownDevice).values({ id, tokenHash, shared, lastSeenAt: now });
  },

  async updateDevice(tx, id, { shared, now }) {
    await tx.update(knownDevice).set({ shared, lastSeenAt: now }).where(eq(knownDevice.id, id));
  },

  async upsertDeviceUser(tx, deviceId, userId, now) {
    await tx
      .insert(deviceUser)
      .values({ deviceId, userId, lastPasswordLoginAt: now })
      .onDuplicateKeyUpdate({ set: { lastPasswordLoginAt: now } });
  },

  async listDeviceUserIds(tx, deviceId, since) {
    const rows = await tx
      .select({ userId: deviceUser.userId })
      .from(deviceUser)
      .where(and(eq(deviceUser.deviceId, deviceId), gte(deviceUser.lastPasswordLoginAt, since)));
    return rows.map((row) => row.userId);
  },

  async rateLimitHits(tx, key, windowStart) {
    const [row] = await tx
      .select({ hits: rateLimitBucket.hits })
      .from(rateLimitBucket)
      .where(and(eq(rateLimitBucket.bucketKey, key), eq(rateLimitBucket.windowStart, windowStart)));
    return row?.hits ?? 0;
  },

  async rateLimitRegister(tx, key, windowStart) {
    // Soma atômica: cria o contador da janela ou incrementa o existente
    await tx
      .insert(rateLimitBucket)
      .values({ bucketKey: key, windowStart, hits: 1 })
      .onDuplicateKeyUpdate({ set: { hits: sql`${rateLimitBucket.hits} + 1` } });
  },

  async rateLimitClear(tx, key) {
    await tx.delete(rateLimitBucket).where(eq(rateLimitBucket.bucketKey, key));
  },

  async purge(tx, limits) {
    const [grants] = await tx
      .delete(elevatedGrant)
      .where(lt(elevatedGrant.createdAt, limits.grantsCreatedBefore));
    const [sessions] = await tx
      .delete(userSession)
      .where(
        or(
          lt(userSession.revokedAt, limits.sessionsEndedBefore),
          and(isNull(userSession.revokedAt), lt(userSession.expiresAt, limits.sessionsEndedBefore)),
        ),
      );
    const [buckets] = await tx
      .delete(rateLimitBucket)
      .where(lt(rateLimitBucket.windowStart, limits.rateLimitWindowsBefore));
    const [deviceUsers] = await tx
      .delete(deviceUser)
      .where(lt(deviceUser.lastPasswordLoginAt, limits.deviceUsersBefore));
    return {
      autorizacoesDoGerente: grants.affectedRows,
      sessoes: sessions.affectedRows,
      contadoresDeTentativas: buckets.affectedRows,
      usuariosDeAparelhos: deviceUsers.affectedRows,
    };
  },
};
