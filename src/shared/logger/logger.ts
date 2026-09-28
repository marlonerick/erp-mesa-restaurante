import pino, { type DestinationStream, type Logger } from 'pino';

/** Campos que nunca podem aparecer em log (README B.8, LGPD). */
const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'pin',
  'pinHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'cookie',
  '["set-cookie"]',
  'authorization',
  'cpf',
];

// O redact do Pino casa um nível por curinga; cobrimos até 3 níveis de profundidade.
const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) =>
  ['', '*', '*.*', '*.*.*'].map((prefix) => {
    if (prefix === '') return key;
    return key.startsWith('[') ? `${prefix}${key}` : `${prefix}.${key}`;
  }),
);

// Erros de banco carregam os VALORES das consultas (DrizzleQueryError.params, erro.sql do mysql2)
// e o Drizzle ainda os repete na mensagem ("params: ..."). Nada disso pode ir para o log.
const SQL_FIELDS = ['sql', 'params', 'query', 'values'];
const PARAMS_IN_TEXT = /\nparams: [^\n]*/g;

function sanitizeSerializedError(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const copy: Record<string, unknown> = Object.fromEntries(
    Object.entries(value).filter(([key]) => !SQL_FIELDS.includes(key)),
  );
  for (const field of ['message', 'stack']) {
    const text = copy[field];
    if (typeof text === 'string') {
      copy[field] = text.replace(PARAMS_IN_TEXT, '\nparams: [REDACTED]');
    }
  }
  if ('cause' in copy) {
    copy.cause = sanitizeSerializedError(copy.cause);
  }
  return copy;
}

function serializeError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }
  return sanitizeSerializedError(pino.stdSerializers.errWithCause(error));
}

export interface LoggerOptions {
  readonly level: string;
  /** Destino alternativo (testes). Padrão: stdout. */
  readonly destination?: DestinationStream;
}

export function createLogger({ level, destination }: LoggerOptions): Logger {
  const options: pino.LoggerOptions = {
    level,
    base: { service: 'erp' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    serializers: { err: serializeError, error: serializeError },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  };
  return destination ? pino(options, destination) : pino(options);
}

export interface LogContext {
  readonly requestId: string;
  readonly storeId?: string;
  readonly userId?: string;
}

/** Logger filho que carimba requestId, storeId e userId em todas as linhas. */
export function withContext(logger: Logger, context: LogContext): Logger {
  return logger.child({ ...context });
}

const LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace']);
const globalForLogger = globalThis as unknown as { erpLogger?: Logger };

/**
 * Logger do processo. Lê apenas LOG_LEVEL (padrão "info") e NÃO depende do restante da
 * configuração: precisa funcionar justamente quando o .env está inválido, para registrar o erro.
 */
export function getLogger(): Logger {
  if (!globalForLogger.erpLogger) {
    const level = process.env.LOG_LEVEL;
    globalForLogger.erpLogger = createLogger({
      level: level !== undefined && LEVELS.has(level) ? level : 'info',
    });
  }
  return globalForLogger.erpLogger;
}
