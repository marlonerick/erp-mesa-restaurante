import { count, eq, inArray, sql } from 'drizzle-orm';
import { appUser } from '@/shared/db/schema';
import type { UserRepository } from '../application/ports';

const columns = {
  id: appUser.id,
  organizationId: appUser.organizationId,
  name: appUser.name,
  username: appUser.username,
  passwordHash: appUser.passwordHash,
  pinHash: appUser.pinHash,
  status: appUser.status,
  mustChangePassword: appUser.mustChangePassword,
  failedPinAttempts: appUser.failedPinAttempts,
  pinLockedAt: appUser.pinLockedAt,
};

export const userRepository: UserRepository = {
  async findByUsername(tx, username) {
    const [row] = await tx.select(columns).from(appUser).where(eq(appUser.username, username));
    return row ?? null;
  },

  async findById(tx, id) {
    const [row] = await tx.select(columns).from(appUser).where(eq(appUser.id, id));
    return row ?? null;
  },

  async findManyByIds(tx, ids) {
    if (ids.length === 0) return [];
    return tx
      .select(columns)
      .from(appUser)
      .where(inArray(appUser.id, [...ids]));
  },

  async countAll(tx) {
    const [row] = await tx.select({ total: count() }).from(appUser);
    return row?.total ?? 0;
  },

  async insert(tx, user) {
    await tx.insert(appUser).values(user);
  },

  async updateName(tx, id, name) {
    await tx
      .update(appUser)
      .set({ name, version: sql`${appUser.version} + 1` })
      .where(eq(appUser.id, id));
  },

  async updatePassword(tx, id, { passwordHash, mustChangePassword, changedAt }) {
    await tx
      .update(appUser)
      .set({
        passwordHash,
        mustChangePassword,
        passwordChangedAt: changedAt,
        version: sql`${appUser.version} + 1`,
      })
      .where(eq(appUser.id, id));
  },

  async updatePin(tx, id, pinHash) {
    await tx
      .update(appUser)
      .set({
        pinHash,
        failedPinAttempts: 0,
        pinLockedAt: null,
        version: sql`${appUser.version} + 1`,
      })
      .where(eq(appUser.id, id));
  },

  async registerPinFailure(tx, id, { now, maxAttempts }) {
    // Incremento atômico no banco: duas tentativas simultâneas não se perdem
    await tx
      .update(appUser)
      .set({
        failedPinAttempts: sql`${appUser.failedPinAttempts} + 1`,
        pinLockedAt: sql`IF(${appUser.failedPinAttempts} + 1 >= ${maxAttempts}, ${now}, ${appUser.pinLockedAt})`,
      })
      .where(eq(appUser.id, id));
    const [row] = await tx
      .select({ attempts: appUser.failedPinAttempts, lockedAt: appUser.pinLockedAt })
      .from(appUser)
      .where(eq(appUser.id, id));
    return { attempts: row?.attempts ?? 0, locked: (row?.lockedAt ?? null) !== null };
  },

  async clearPinFailures(tx, id) {
    await tx
      .update(appUser)
      .set({ failedPinAttempts: 0, pinLockedAt: null })
      .where(eq(appUser.id, id));
  },

  async disable(tx, id, now) {
    await tx
      .update(appUser)
      .set({ status: 'DESATIVADO', disabledAt: now, version: sql`${appUser.version} + 1` })
      .where(eq(appUser.id, id));
  },
};
