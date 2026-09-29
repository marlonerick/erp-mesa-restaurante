import { afterAll, inject } from 'vitest';
import { createOrganizationWithStore } from '@/modules/organizations';
import { createDatabase, type Database } from '@/shared/db/client';
import { runInTransaction } from '@/shared/db/transaction';
import type { Id } from '@/shared/kernel';

/**
 * Conexão da suíte de integração com o MySQL real, usando o usuário da APLICAÇÃO.
 * Isolamento entre testes: cada teste usa uma loja (store_id) própria,
 * espelhando o isolamento multi-tenant (ADR-0009) — não é preciso truncar tabelas.
 */
export function useTestDatabase() {
  const connection = createDatabase({ url: inject('databaseUrl'), poolSize: 5 });
  afterAll(async () => {
    await connection.close();
  });
  return connection;
}

/** Loja real e exclusiva do teste (as tabelas por loja têm chave estrangeira para `store`). */
export function createTestStore(db: Database): Promise<Id> {
  return runInTransaction(db, async (tx) => {
    const { storeId } = await createOrganizationWithStore(tx, {
      organizationName: 'Teste',
      companyLegalName: 'Teste Ltda',
      companyTradeName: 'Teste',
      cnpj: null,
      storeName: 'Loja de teste',
      storeCode: 'TESTE',
    });
    return storeId;
  });
}
