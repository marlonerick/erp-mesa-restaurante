import { getAccessibleStores } from '@/modules/authorization';
import {
  clearPinFailures,
  findUserByUsername,
  normalizeUsername,
  type UserRecord,
} from '@/modules/users';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import { type DomainError, isDomainError, newId } from '@/shared/kernel';
import { dummyPasswordHash } from '@/shared/security/password-hasher';
import { generateSecretToken, hashToken } from '@/shared/security/tokens';
import {
  LOGIN_FAILURES_PER_IP,
  LOGIN_FAILURES_PER_USER,
  LOGIN_WINDOW_SECONDS,
  rateLimitWindowStart,
} from '../domain/rate-limit-policy';
import type { AuthDependencies, DeviceRecord, RequestMeta } from './ports';
import { authErrors, openSession, recordLoginFailure } from './shared';

export interface LoginInput {
  readonly username: string;
  readonly password: string;
  readonly sharedDevice: boolean;
  /** Token do cookie do aparelho, se já existir. */
  readonly deviceToken: string | null;
}

export interface LoginResult {
  readonly sessionToken: string;
  /** Token do aparelho (novo ou o mesmo) para gravar no cookie de longa duração. */
  readonly deviceToken: string;
  readonly mustChangePassword: boolean;
}

type Outcome = { ok: true; result: LoginResult } | { ok: false; error: DomainError };

const userKey = (username: string) => `login:user:${username}`;
const ipKey = (ip: string) => `login:ip:${ip}`;

function safeUsername(input: string): string | null {
  try {
    return normalizeUsername(input);
  } catch (error) {
    if (isDomainError(error)) return null;
    throw error;
  }
}

async function resolveDevice(
  deps: AuthDependencies,
  tx: Transaction,
  deviceToken: string | null,
  shared: boolean,
  now: Date,
): Promise<{ device: DeviceRecord; token: string; isNew: boolean }> {
  const existing = deviceToken
    ? await deps.repo.findDeviceByTokenHash(tx, hashToken(deviceToken))
    : null;
  if (existing && deviceToken) {
    await deps.repo.updateDevice(tx, existing.id, { shared, now });
    return { device: { id: existing.id, shared }, token: deviceToken, isNew: false };
  }
  const token = generateSecretToken();
  const id = newId();
  await deps.repo.insertDevice(tx, { id, tokenHash: hashToken(token), shared, now });
  return { device: { id, shared }, token, isNew: true };
}

/**
 * Login por usuário e senha (docs/modules/auth.md). Falhas são GRAVADAS (limite de tentativas e
 * auditoria) e só depois o erro é devolvido — por isso o resultado sai da transação como valor.
 */
export async function login(
  deps: AuthDependencies,
  input: LoginInput,
  meta: RequestMeta,
): Promise<LoginResult> {
  const now = deps.clock.now();
  const username = safeUsername(input.username);
  const attempted = username ?? input.username.trim().toLowerCase();
  const window = rateLimitWindowStart(now, LOGIN_WINDOW_SECONDS);

  const outcome = await runInTransaction(deps.db, async (tx): Promise<Outcome> => {
    const userHits = await deps.repo.rateLimitHits(tx, userKey(attempted), window);
    const blocked =
      userHits >= LOGIN_FAILURES_PER_USER ||
      (meta.ip !== null &&
        (await deps.repo.rateLimitHits(tx, ipKey(meta.ip), window)) >= LOGIN_FAILURES_PER_IP);
    if (blocked) {
      await recordLoginFailure(tx, {
        user: null,
        attemptedUsername: attempted,
        reason: 'RATE_LIMITED',
        method: 'PASSWORD',
        meta,
        now,
      });
      return { ok: false, error: authErrors.rateLimited() };
    }

    const user: UserRecord | null = username ? await findUserByUsername(tx, username) : null;
    // Usuário inexistente também passa pelo Argon2: mesma demora, nada revelado (RN-AUTH-03)
    const passwordOk = await deps.hasher.verify(
      user?.passwordHash ?? (await dummyPasswordHash(deps.hasher)),
      input.password,
    );
    if (!user || !passwordOk || user.status !== 'ATIVO') {
      await deps.repo.rateLimitRegister(tx, userKey(attempted), window);
      if (meta.ip !== null) await deps.repo.rateLimitRegister(tx, ipKey(meta.ip), window);
      await recordLoginFailure(tx, {
        user,
        attemptedUsername: attempted,
        reason: user?.status === 'DESATIVADO' ? 'USUARIO_DESATIVADO' : 'CREDENCIAIS_INVALIDAS',
        method: 'PASSWORD',
        meta,
        now,
      });
      return { ok: false, error: authErrors.invalidCredentials() };
    }

    const [store] = await getAccessibleStores(tx, user.id, user.organizationId);
    if (!store) {
      await recordLoginFailure(tx, {
        user,
        attemptedUsername: attempted,
        reason: 'SEM_LOJA',
        method: 'PASSWORD',
        meta,
        now,
      });
      return { ok: false, error: authErrors.noStoreAccess() };
    }

    // Só apaga o contador se houver falhas: um DELETE sem linhas ainda "tranca" a faixa do índice
    // (gap lock) e causava deadlock entre logins simultâneos de pessoas diferentes
    if (userHits > 0) await deps.repo.rateLimitClear(tx, userKey(user.username));
    // Entrar com a senha destrava o PIN (RN-AUTH-12)
    if (user.pinLockedAt !== null || user.failedPinAttempts > 0)
      await clearPinFailures(tx, user.id);

    const {
      device,
      token: deviceToken,
      isNew: deviceIsNew,
    } = await resolveDevice(deps, tx, input.deviceToken, input.sharedDevice, now);
    await deps.repo.upsertDeviceUser(tx, device.id, user.id, now);
    const { token } = await openSession(deps, tx, {
      user,
      store,
      device,
      deviceIsNew,
      method: 'PASSWORD',
      meta,
      now,
    });
    return {
      ok: true,
      result: { sessionToken: token, deviceToken, mustChangePassword: user.mustChangePassword },
    };
  });

  if (!outcome.ok) throw outcome.error;
  return outcome.result;
}
