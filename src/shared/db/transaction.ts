import type { Database } from './client';
import { MYSQL_ERRNO, mysqlErrno } from './mysql-errors';

/** Transação ativa, repassada a todos os repositórios envolvidos no caso de uso (ADR-0008). */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const RETRYABLE = new Set<number>([MYSQL_ERRNO.DEADLOCK, MYSQL_ERRNO.LOCK_WAIT_TIMEOUT]);
const MAX_ATTEMPTS = 3;

/**
 * Executa `work` em UMA transação (unidade de trabalho do caso de uso).
 * Em deadlock ou lock wait timeout, repete a transação inteira até 3 vezes — seguro porque
 * os comandos críticos são idempotentes. Qualquer outro erro desfaz tudo e é repassado.
 */
export async function runInTransaction<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.transaction(work);
    } catch (error) {
      const errno = mysqlErrno(error);
      if (attempt >= MAX_ATTEMPTS || errno === undefined || !RETRYABLE.has(errno)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10 * attempt + Math.random() * 20));
    }
  }
}
