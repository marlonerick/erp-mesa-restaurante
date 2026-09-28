import type { Database } from './client';
import { MYSQL_ERRNO, mysqlErrno } from './mysql-errors';

/** Transação ativa, repassada a todos os repositórios envolvidos no caso de uso (ADR-0008). */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const RETRYABLE = new Set<number>([MYSQL_ERRNO.DEADLOCK, MYSQL_ERRNO.LOCK_WAIT_TIMEOUT]);
const MAX_ATTEMPTS = 3;

/**
 * Executa `work` em UMA transação REPEATABLE READ (unidade de trabalho do caso de uso).
 * Qualquer erro desfaz tudo e é repassado.
 *
 * Em deadlock ou lock wait timeout, `work` é executado DE NOVO, POR INTEIRO, até 3 vezes.
 * Por isso `work` deve conter apenas operações no banco: nada de chamada HTTP, impressão,
 * eventos para fora do processo ou alteração de estado capturado fora da função (ADR-0008).
 */
export async function runInTransaction<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.transaction(work, { isolationLevel: 'repeatable read' });
    } catch (error) {
      const errno = mysqlErrno(error);
      if (attempt >= MAX_ATTEMPTS || errno === undefined || !RETRYABLE.has(errno)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10 * attempt + Math.random() * 20));
    }
  }
}
