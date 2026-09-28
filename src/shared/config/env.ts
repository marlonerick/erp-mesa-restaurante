import { z } from 'zod';

const mysqlUrl = z
  .url()
  .refine((value) => value.startsWith('mysql://'), { message: 'deve começar com mysql://' });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: mysqlUrl,
  MIGRATOR_DATABASE_URL: mysqlUrl.optional(),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Variáveis de ambiente inválidas ou ausentes: ${variables.join(', ')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

/** Valida as variáveis de ambiente. A mensagem de erro cita apenas NOMES, nunca valores. */
export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const variables = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new InvalidEnvironmentError(variables);
  }
  return result.data;
}

let cached: Env | undefined;

/** Configuração do processo, validada na primeira chamada (falha rápida). */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
