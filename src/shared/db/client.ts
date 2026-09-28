import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { getEnv } from '../config/env';
import * as schema from './schema';

export interface DatabaseOptions {
  readonly url: string;
  readonly poolSize: number;
}

export function createDatabase({ url, poolSize }: DatabaseOptions) {
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: poolSize,
    // Datas trafegam em UTC (ADR-0013); DECIMAL e BIGINT chegam como texto, sem float (ADR-0003)
    timezone: 'Z',
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    enableKeepAlive: true,
  });
  const db = drizzle(pool, { schema, mode: 'default' });

  return {
    db,
    /** Verifica se o banco responde (usado por /ready). */
    ping: async (): Promise<void> => {
      await pool.query('SELECT 1');
    },
    close: async (): Promise<void> => {
      await pool.end();
    },
  };
}

export type DatabaseConnection = ReturnType<typeof createDatabase>;
export type Database = DatabaseConnection['db'];

// Uma única conexão por processo; sobrevive ao hot reload do Next em desenvolvimento.
const globalForDb = globalThis as unknown as { erpDatabase?: DatabaseConnection };

export function getDatabase(): DatabaseConnection {
  if (!globalForDb.erpDatabase) {
    const env = getEnv();
    globalForDb.erpDatabase = createDatabase({ url: env.DATABASE_URL, poolSize: env.DB_POOL_SIZE });
  }
  return globalForDb.erpDatabase;
}
