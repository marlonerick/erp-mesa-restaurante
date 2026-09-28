import { getAccessibleStores } from '@/modules/authorization';
import { findUserById, findUsersByIds } from '@/modules/users';
import { runInTransaction } from '@/shared/db/transaction';
import type { DomainError, Id } from '@/shared/kernel';
import { hashToken } from '@/shared/security/tokens';
import type { AuthDependencies, RequestMeta } from './ports';
import { authErrors, checkPin, openSession, pinError, recordLoginFailure } from './shared';

/** Quem entrou com senha há mais de 7 dias sai da lista de troca rápida (RN-AUTH-11). */
const DEVICE_USER_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;

export interface DeviceUser {
  readonly id: Id;
  readonly name: string;
  readonly pinLocked: boolean;
}

/** Lista da tela "Quem está usando?" deste aparelho. Aparelho desconhecido: lista vazia. */
export async function listDeviceUsers(
  deps: AuthDependencies,
  deviceToken: string | null,
): Promise<DeviceUser[]> {
  if (!deviceToken) return [];
  const since = new Date(deps.clock.now().getTime() - DEVICE_USER_VALIDITY_MS);
  return runInTransaction(deps.db, async (tx) => {
    const device = await deps.repo.findDeviceByTokenHash(tx, hashToken(deviceToken));
    if (!device) return [];
    const users = await findUsersByIds(tx, await deps.repo.listDeviceUserIds(tx, device.id, since));
    return users
      .filter((user) => user.status === 'ATIVO' && user.pinHash !== null)
      .map((user) => ({ id: user.id, name: user.name, pinLocked: user.pinLockedAt !== null }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });
}

type Outcome = { ok: true; token: string } | { ok: false; error: DomainError };

/** Troca rápida com PIN no aparelho compartilhado (RN-AUTH-11, RN-AUTH-12). */
export async function switchUser(
  deps: AuthDependencies,
  input: { deviceToken: string | null; userId: Id; pin: string },
  meta: RequestMeta,
): Promise<{ sessionToken: string }> {
  const now = deps.clock.now();
  const since = new Date(now.getTime() - DEVICE_USER_VALIDITY_MS);

  const outcome = await runInTransaction(deps.db, async (tx): Promise<Outcome> => {
    const device = input.deviceToken
      ? await deps.repo.findDeviceByTokenHash(tx, hashToken(input.deviceToken))
      : null;
    const allowed = device
      ? (await deps.repo.listDeviceUserIds(tx, device.id, since)).includes(input.userId)
      : false;
    const user = allowed ? await findUserById(tx, input.userId) : null;
    if (!device || user?.status !== 'ATIVO') {
      return { ok: false, error: authErrors.deviceUserNotAllowed() };
    }

    const pin = await checkPin(deps, tx, user, input.pin, now);
    if (pin !== 'OK') {
      await recordLoginFailure(tx, {
        user,
        attemptedUsername: user.username,
        reason: `PIN_${pin}`,
        method: 'PIN',
        meta,
        now,
      });
      return { ok: false, error: pinError(pin) };
    }

    const [store] = await getAccessibleStores(tx, user.id, user.organizationId);
    if (!store) {
      return { ok: false, error: authErrors.noStoreAccess() };
    }
    const { token } = await openSession(deps, tx, {
      user,
      store,
      device,
      method: 'PIN',
      meta,
      now,
    });
    return { ok: true, token };
  });

  if (!outcome.ok) throw outcome.error;
  return { sessionToken: outcome.token };
}
