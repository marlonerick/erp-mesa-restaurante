import pino, { type DestinationStream, type Logger } from 'pino';
import { getEnv } from '../config/env';

/** Campos que nunca podem aparecer em log (README B.8, LGPD). */
const REDACT_PATHS = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'pin',
  '*.pin',
  'pinHash',
  '*.pinHash',
  'token',
  '*.token',
  'cookie',
  'authorization',
  'headers.cookie',
  'headers.authorization',
  '*.headers.cookie',
  '*.headers.authorization',
  'cpf',
  '*.cpf',
];

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

const globalForLogger = globalThis as unknown as { erpLogger?: Logger };

export function getLogger(): Logger {
  globalForLogger.erpLogger ??= createLogger({ level: getEnv().LOG_LEVEL });
  return globalForLogger.erpLogger;
}
