import { INTERNAL_ERROR_STATUS, toErrorResponse } from './error-response';

/**
 * Estado devolvido pelas Server Actions de formulário (usado com useActionState no React).
 * Só mensagens prontas para o usuário — nunca detalhes internos.
 */
export interface FormState {
  readonly error?: string;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly success?: string;
  /** Precisa de outra ação da pessoa (ex.: recontar o dinheiro); não é erro nem sucesso. */
  readonly warning?: string;
  /** Muda a cada envio bem-sucedido, para o formulário poder se limpar. */
  readonly submittedAt?: number;
}

interface ErrorLogger {
  error(context: Record<string, unknown>, message: string): void;
}

export function formError(error: unknown, requestId: string, logger: ErrorLogger): FormState {
  const response = toErrorResponse(error, requestId);
  if (response.status === INTERNAL_ERROR_STATUS) {
    logger.error({ err: error, requestId }, 'Erro inesperado');
  }
  const fields = response.body.details.fields as Record<string, string[]> | undefined;
  return {
    error: response.body.message,
    ...(fields ? { fieldErrors: fields } : {}),
  };
}

export function formSuccess(message: string): FormState {
  return { success: message, submittedAt: Date.now() };
}

/** Aviso que pede outra ação; muda `submittedAt` (o próximo envio é uma intenção nova). */
export function formWarning(message: string): FormState {
  return { warning: message, submittedAt: Date.now() };
}
