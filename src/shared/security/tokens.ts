import { createHash, randomBytes } from 'node:crypto';

/**
 * Token secreto aleatório de 256 bits (sessão, aparelho, autorização do gerente).
 * Vai para o cookie/cliente; no banco fica apenas o hash (RN-AUTH-05).
 */
export function generateSecretToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 em hexadecimal (64 caracteres). Tokens aleatórios longos dispensam hash lento. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
