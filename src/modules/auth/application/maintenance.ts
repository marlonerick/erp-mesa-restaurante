import { runInTransaction } from '@/shared/db/transaction';
import type { AuthDependencies } from './ports';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Limpeza periódica (decisão Q-13b, LGPD): sessões encerradas/expiradas há mais de 90 dias (IP e
 * navegador), vínculos de aparelho sem uso há 90 dias, contadores de tentativas e autorizações do
 * gerente com mais de 1 dia. A AUDITORIA NÃO é apagada (fica para sempre — Q-13).
 */
export function purgeExpiredAuthData(deps: AuthDependencies): Promise<Record<string, number>> {
  const now = deps.clock.now().getTime();
  return runInTransaction(deps.db, (tx) =>
    deps.repo.purge(tx, {
      sessionsEndedBefore: new Date(now - 90 * DAY_MS),
      deviceUsersBefore: new Date(now - 90 * DAY_MS),
      grantsCreatedBefore: new Date(now - DAY_MS),
      rateLimitWindowsBefore: new Date(now - DAY_MS),
    }),
  );
}
