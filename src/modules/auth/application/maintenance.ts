import { purgeExpiredElevatedGrants } from '@/modules/authorization';
import { runInTransaction } from '@/shared/db/transaction';
import type { AuthDependencies } from './ports';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Limpeza periódica (decisão Q-13b, LGPD): sessões encerradas/expiradas há mais de 90 dias (IP e
 * navegador), vínculos de aparelho sem uso há 90 dias, contadores de tentativas e autorizações do
 * gerente com mais de 1 dia. A AUDITORIA NÃO é apagada (fica para sempre — Q-13).
 * As autorizações do gerente pertencem ao módulo Authorization e são apagadas pela API dele
 * (achado I6 da revisão) — antes das sessões, que elas referenciam.
 */
export function purgeExpiredAuthData(deps: AuthDependencies): Promise<Record<string, number>> {
  const now = deps.clock.now().getTime();
  return runInTransaction(deps.db, async (tx) => {
    const grants = await purgeExpiredElevatedGrants(tx, new Date(now - DAY_MS));
    const removed = await deps.repo.purge(tx, {
      sessionsEndedBefore: new Date(now - 90 * DAY_MS),
      deviceUsersBefore: new Date(now - 90 * DAY_MS),
      rateLimitWindowsBefore: new Date(now - DAY_MS),
    });
    return { autorizacoesDoGerente: grants, ...removed };
  });
}
