// Parte do teste de restauração (deploy/restore-test.sh): o SISTEMA conecta no banco restaurado e
// lê as tabelas principais com o próprio código (mesmo pool, mesmo fuso, mesmo esquema Drizzle).
// Uso: DATABASE_URL apontando para o banco restaurado (somente leitura).
import { count } from 'drizzle-orm';
import { getDatabase } from '@/shared/db/client';
import { appUser, auditLog, customerOrder, payment, product, store } from '@/shared/db/schema';
import { checkApplicationReadiness } from '@/shared/http/readiness';

const readiness = await checkApplicationReadiness();
if (readiness.status !== 200) {
  console.error('O banco restaurado não respondeu.');
  process.exit(1);
}

const { db, close } = getDatabase();
try {
  const tables = { store, appUser, product, customerOrder, payment, auditLog };
  for (const [name, table] of Object.entries(tables)) {
    const [row] = await db.select({ total: count() }).from(table);
    console.info(`  ${name}: ${String(row?.total ?? 0)} linhas lidas pelo sistema`);
  }
} finally {
  await close();
}
