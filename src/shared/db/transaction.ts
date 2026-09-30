import type { Database } from './client';
import { MYSQL_ERRNO, mysqlErrno } from './mysql-errors';

/** Transação ativa, repassada a todos os repositórios envolvidos no caso de uso (ADR-0008). */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const RETRYABLE = new Set<number>([MYSQL_ERRNO.DEADLOCK, MYSQL_ERRNO.LOCK_WAIT_TIMEOUT]);
/**
 * 5 tentativas com espera crescente e aleatória: com várias pessoas lançando ao mesmo tempo, duas
 * transações desfeitas no mesmo deadlock não voltam juntas (3 tentativas seguidas falharam sob carga
 * nos testes da Etapa 7).
 */
const MAX_ATTEMPTS = 5;

/**
 * Executa `work` em UMA transação REPEATABLE READ (unidade de trabalho do caso de uso).
 * Qualquer erro desfaz tudo e é repassado.
 *
 * Em deadlock ou lock wait timeout, `work` é executado DE NOVO, POR INTEIRO, até 5 vezes.
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
      // 20–40 ms, 40–80 ms, 80–160 ms, 160–320 ms
      const base = 20 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, base + Math.random() * base));
    }
  }
}
