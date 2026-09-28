/** Códigos de erro do MySQL usados pela aplicação. */
export const MYSQL_ERRNO = {
  DUPLICATE_ENTRY: 1062,
  LOCK_WAIT_TIMEOUT: 1205,
  DEADLOCK: 1213,
} as const;

/**
 * Número do erro MySQL, procurando também em `cause` — o Drizzle embrulha o erro
 * do driver em `DrizzleQueryError`.
 */
export function mysqlErrno(error: unknown): number | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const errno = (current as { errno?: unknown }).errno;
    if (typeof errno === 'number') {
      return errno;
    }
    current = current.cause;
  }
  return undefined;
}
