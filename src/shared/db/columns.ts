import { sql } from 'drizzle-orm';
import { datetime, int } from 'drizzle-orm/mysql-core';

// Colunas repetidas em quase todas as tabelas (docs/database/modelo-de-dados.md §1).
// Datas em UTC com milissegundos: DATETIME(3).

export const utcDatetime = (name: string) => datetime(name, { mode: 'date', fsp: 3 });

export const timestamps = {
  createdAt: utcDatetime('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP(3))`),
  updatedAt: utcDatetime('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP(3))`)
    .$onUpdate(() => new Date()),
};

/** Versão para bloqueio otimista (ADR-0008): muda a cada alteração do registro. */
export const version = () => int('version', { unsigned: true }).notNull().default(0);
