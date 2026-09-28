import { hash, verify } from '@node-rs/argon2';

// Argon2id (padrão da biblioteca) com os parâmetros mínimos recomendados pela OWASP:
// 19 MiB de memória, 2 iterações, 1 via. Senhas e PINs nunca são guardados em texto (RN-AUTH-02).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export interface PasswordHasher {
  hash(secret: string): Promise<string>;
  verify(storedHash: string, secret: string): Promise<boolean>;
}

export const argon2Hasher: PasswordHasher = {
  hash: (secret) => hash(secret, OPTIONS),
  verify: async (storedHash, secret) => {
    try {
      return await verify(storedHash, secret);
    } catch {
      // Hash corrompido ou em formato desconhecido: trata como senha errada
      return false;
    }
  },
};

let dummyHash: Promise<string> | undefined;

/**
 * Hash descartável para comparar quando o usuário NÃO existe: o login leva o mesmo tempo nos dois
 * casos e não revela quais usuários existem (RN-AUTH-03).
 */
export function dummyPasswordHash(hasher: PasswordHasher): Promise<string> {
  dummyHash ??= hasher.hash('usuario-inexistente-tempo-constante');
  return dummyHash;
}
