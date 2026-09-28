import { type ErrorBody, INTERNAL_ERROR_STATUS, toErrorResponse } from './error-response';

/** Resultado de toda Server Action: nunca lança exceção para o cliente (docs/api/convencoes.md §2). */
export type ActionResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ErrorBody };

interface ErrorLogger {
  error(context: Record<string, unknown>, message: string): void;
}

export function actionSuccess<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

/**
 * Converte o erro em resposta pública. Erros inesperados são registrados no log com o erro
 * original (ligado ao requestId); erros de negócio esperados não poluem o log de erros.
 */
export function actionFailure(
  error: unknown,
  requestId: string,
  logger: ErrorLogger,
): ActionResult<never> {
  const response = toErrorResponse(error, requestId);
  if (response.status === INTERNAL_ERROR_STATUS) {
    logger.error({ err: error, requestId }, 'Erro inesperado');
  }
  return { ok: false, error: response.body };
}
