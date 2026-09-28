/**
 * Categoria do erro de domínio. A camada de interface converte cada categoria
 * em um status HTTP (docs/api/convencoes.md §2).
 */
export type DomainErrorKind =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'RATE_LIMITED';

const CODE_FORMAT = /^[A-Z][A-Z0-9_]*$/;

/**
 * Erro esperado de regra de negócio. `message` é exibida ao usuário final (português);
 * `details` nunca deve conter segredos.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly kind: DomainErrorKind = 'BUSINESS_RULE',
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    if (!CODE_FORMAT.test(code)) {
      throw new Error(`código de erro inválido "${code}": use MAIÚSCULAS_COM_SUBLINHADO`);
    }
    super(message);
    this.name = 'DomainError';
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
