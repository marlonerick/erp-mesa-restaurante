import { DomainError } from '@/shared/kernel';

const USERNAME_FORMAT = /^[a-z0-9._-]{3,50}$/;

/** Nome de usuário em minúsculas, sem acentos nem espaços (RN-USERS-02). */
export function normalizeUsername(input: string): string {
  const username = input.trim().toLowerCase();
  if (!USERNAME_FORMAT.test(username)) {
    throw new DomainError(
      'INVALID_USERNAME',
      'Use de 3 a 50 letras minúsculas, números, ponto, hífen ou sublinhado.',
      'VALIDATION',
    );
  }
  return username;
}
