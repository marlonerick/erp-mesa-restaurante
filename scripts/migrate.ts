// Aplica as migrations pendentes usando o usuário de MIGRATION (com DDL).
// Uso: npm run db:migrate   (lê MIGRATOR_DATABASE_URL do .env)
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';

const url = process.env.MIGRATOR_DATABASE_URL;
if (!url) {
  console.error('MIGRATOR_DATABASE_URL não definida. Copie .env.example para .env.');
  process.exit(1);
}

const connection = await mysql.createConnection({ uri: url, multipleStatements: true });
try {
  await migrate(drizzle(connection), { migrationsFolder: 'drizzle' });
  console.info('Migrations aplicadas com sucesso.');
} finally {
  await connection.end();
}
