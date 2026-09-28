import { afterAll, inject } from 'vitest';
import { createDatabase } from '@/shared/db/client';

/**
 * Conexão da suíte de integração com o MySQL real, usando o usuário da APLICAÇÃO.
 * Isolamento entre testes: cada teste usa uma loja (store_id) própria gerada com newId(),
 * espelhando o isolamento multi-tenant (ADR-0009) — não é preciso truncar tabelas.
 */
export function useTestDatabase() {
  const connection = createDatabase({ url: inject('databaseUrl'), poolSize: 5 });
  afterAll(async () => {
    await connection.close();
  });
  return connection;
}
