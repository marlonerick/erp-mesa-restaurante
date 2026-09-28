import { MySqlContainer } from '@testcontainers/mysql';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** URL do usuário da APLICAÇÃO (apenas SELECT/INSERT/UPDATE/DELETE). */
    databaseUrl: string;
  }
}

const APP_USER = 'erp_app';
const APP_PASSWORD = 'app_test_only';
const DATABASE = 'erp_test';

/**
 * Sobe um MySQL 8.4 real (Testcontainers) uma vez para toda a suíte de integração,
 * aplica as migrations como root e cria o usuário da aplicação com privilégios mínimos.
 * Proibido usar SQLite ou mock de banco (README B.3 / A.3 item 16).
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new MySqlContainer('mysql:8.4')
    .withDatabase(DATABASE)
    .withRootPassword('root_test_only')
    .withCommand([
      '--character-set-server=utf8mb4',
      '--collation-server=utf8mb4_0900_ai_ci',
      '--default-time-zone=+00:00',
      '--sql-mode=STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY',
      '--transaction-isolation=REPEATABLE-READ',
    ])
    .start();

  const rootConnection = await mysql.createConnection({
    uri: container.getConnectionUri(true),
    multipleStatements: true,
  });
  try {
    await migrate(drizzle(rootConnection), { migrationsFolder: 'drizzle' });
    await rootConnection.query(
      `CREATE USER '${APP_USER}'@'%' IDENTIFIED BY '${APP_PASSWORD}';
       GRANT SELECT, INSERT, UPDATE, DELETE ON \`${DATABASE}\`.* TO '${APP_USER}'@'%';
       FLUSH PRIVILEGES;`,
    );
  } finally {
    await rootConnection.end();
  }

  const host = container.getHost();
  const port = container.getPort();
  project.provide(
    'databaseUrl',
    `mysql://${APP_USER}:${APP_PASSWORD}@${host}:${String(port)}/${DATABASE}`,
  );

  return async () => {
    await container.stop();
  };
}
