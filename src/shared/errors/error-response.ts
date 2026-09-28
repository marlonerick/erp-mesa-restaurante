import { ZodError } from 'zod';
import { type DomainErrorKind, isDomainError } from '../kernel';

/** Corpo padrão de erro (README B.8). Nunca contém stack, SQL ou nome de tabela. */
export interface ErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly requestId: string;
}

export interface ErrorResponse {
  readonly status: number;
  readonly body: ErrorBody;
}

const STATUS_BY_KIND: Readonly<Record<DomainErrorKind, number>> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BUSINESS_RULE: 422,
  RATE_LIMITED: 429,
};

export const INTERNAL_ERROR_STATUS = 500;

/** Converte qualquer erro no formato público (docs/api/convencoes.md §2). */
export function toErrorResponse(error: unknown, requestId: string): ErrorResponse {
  if (isDomainError(error)) {
    return {
      status: STATUS_BY_KIND[error.kind],
      body: { code: error.code, message: error.message, details: error.details, requestId },
    };
  }

  if (error instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const path = issue.path.map(String).join('.');
      (fields[path] ??= []).push(issue.message);
    }
    return {
      status: 400,
      body: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos. Verifique os campos informados.',
        details: { fields },
        requestId,
      },
    };
  }

  return {
    status: INTERNAL_ERROR_STATUS,
    body: {
      code: 'INTERNAL_ERROR',
      message: 'Ocorreu um erro inesperado. Tente novamente em instantes.',
      details: {},
      requestId,
    },
  };
}
