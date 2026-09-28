import { getAccessibleStores } from '@/modules/authorization';
import {
  clearPinFailures,
  findUserById,
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
import { authErrors, openSession, recordLoginFailure, reserveAttempt } from './shared';

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
  sharedRequested: boolean,
  now: Date,
): Promise<{ device: DeviceRecord; token: string; isNew: boolean }> {
  const existing = deviceToken
    ? await deps.repo.findDeviceByTokenHash(tx, hashToken(deviceToken))
    : null;
  if (existing && deviceToken) {
    // Uma vez compartilhado, continua compartilhado: esquecer de marcar a caixa no tablet do salão
    // não pode transformar as sessões dele em sessões de 12 h (achado I2 da revisão)
    const shared = existing.shared || sharedRequested;
    await deps.repo.updateDevice(tx, existing.id, { shared, now });
    return { device: { id: existing.id, shared }, token: deviceToken, isNew: false };
  }
  const token = generateSecretToken();
  const id = newId();
  await deps.repo.insertDevice(tx, {
    id,
    tokenHash: hashToken(token),
    shared: sharedRequested,
    now,
  });
  return { device: { id, shared: sharedRequested }, token, isNew: true };
}

/**
 * Login por usuário e senha (docs/modules/auth.md), em três passos:
 * 1) transação curta: RESERVA a tentativa nos contadores (usuário e IP) — tentativas simultâneas
 *    passam em fila e só as 5 primeiras seguem (achado B2 da revisão); lê o usuário;
 * 2) Argon2 FORA do banco (não segura conexão do pool — achado I5);
 * 3) transação curta: grava a falha (auditoria) ou abre a sessão e devolve a tentativa reservada.
 */
export async function login(
  deps: AuthDependencies,
  input: LoginInput,
  meta: RequestMeta,
): Promise<LoginResult> {
  const now = deps.clock.now();
  const username = safeUsername(input.username);
  const counterName = username ?? `invalido:${hashToken(input.username.trim().toLowerCase())}`;
  const window = rateLimitWindowStart(now, LOGIN_WINDOW_SECONDS);

  // 1) Reserva e leitura
  const phase1 = await runInTransaction(
    deps.db,
    async (tx): Promise<{ allowed: false } | { allowed: true; user: UserRecord | null }> => {
      const userAllowed = await reserveAttempt(
        deps,
        tx,
        userKey(counterName),
        LOGIN_FAILURES_PER_USER,
        window,
      );
      // O IP só é reservado se o usuário ainda pode tentar: tentativas já recusadas pelo limite do
      // usuário não somam no IP — senão um garçom insistindo bloquearia o restaurante inteiro,
      // que costuma sair pelo mesmo IP (achado I-A da reverificação)
      const ipAllowed =
        !userAllowed ||
        meta.ip === null ||
        (await reserveAttempt(deps, tx, ipKey(meta.ip), LOGIN_FAILURES_PER_IP, window));
      if (!userAllowed || !ipAllowed) {
        await recordLoginFailure(tx, {
          user: null,
          attemptedUsername: username,
          reason: 'RATE_LIMITED',
          method: 'PASSWORD',
          meta,
          now,
        });
        return { allowed: false };
      }
      return { allowed: true, user: username ? await findUserByUsername(tx, username) : null };
    },
  );
  if (!phase1.allowed) throw authErrors.rateLimited();

  // 2) Conferência da senha. Usuário inexistente também passa pelo Argon2: mesma demora (RN-AUTH-03)
  const passwordOk = await deps.hasher.verify(
    phase1.user?.passwordHash ?? (await dummyPasswordHash(deps.hasher)),
    input.password,
  );

  // 3) Resultado
  const outcome = await runInTransaction(deps.db, async (tx): Promise<Outcome> => {
    // Relê: o usuário pode ter sido desativado ou ter a senha trocada nesse meio-tempo
    const user = phase1.user ? await findUserById(tx, phase1.user.id) : null;
    const valid =
      user !== null &&
      passwordOk &&
      user.status === 'ATIVO' &&
      user.passwordHash === phase1.user?.passwordHash;
    if (!valid) {
      await recordLoginFailure(tx, {
        user,
        attemptedUsername: username,
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
        attemptedUsername: username,
        reason: 'SEM_LOJA',
        method: 'PASSWORD',
        meta,
        now,
      });
      return { ok: false, error: authErrors.noStoreAccess() };
    }

    // Login certo: zera o contador do usuário e devolve a tentativa ao IP — o restaurante inteiro
    // costuma sair pelo mesmo IP, e a troca de turno não pode bloquear a equipe
    await deps.repo.rateLimitClear(tx, userKey(user.username), window);
    if (meta.ip !== null) await deps.repo.rateLimitRelease(tx, ipKey(meta.ip), window);
    // Entrar com a senha destrava o PIN (RN-AUTH-12)
    if (user.pinLockedAt !== null || user.failedPinAttempts > 0) {
      await clearPinFailures(tx, user.id);
    }

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
