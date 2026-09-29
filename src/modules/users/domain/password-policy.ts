import {
  DomainError,
  PASSWORD_MAX_LENGTH as MAX_LENGTH,
  PASSWORD_MIN_LENGTH as MIN_LENGTH,
} from '@/shared/kernel';

// Senhas que aparecem no topo das listas de vazamentos; comparação sem maiúsculas/minúsculas.
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  '11111111',
  '00000000',
  'senha123',
  'senha1234',
  'password',
  'password1',
  'qwerty123',
  'abc12345',
  'restaurante',
  'mudar123',
  'admin123',
]);

function weak(reason: string): DomainError {
  return new DomainError('WEAK_PASSWORD', reason, 'VALIDATION');
}

/**
 * Regras de senha (RN-AUTH-08), no estilo das recomendações atuais de segurança: tamanho mínimo
 * e bloqueio de senhas óbvias, sem exigir símbolos que só levam a senhas previsíveis.
 */
export function validateNewPassword(password: string, username: string): void {
  if (password.length < MIN_LENGTH) {
    throw weak(`A senha deve ter pelo menos ${String(MIN_LENGTH)} caracteres.`);
  }
  if (password.length > MAX_LENGTH) {
    throw weak(`A senha deve ter no máximo ${String(MAX_LENGTH)} caracteres.`);
  }
  const lower = password.toLowerCase();
  if (lower === username.toLowerCase()) {
    throw weak('A senha deve ser diferente do seu usuário.');
  }
  if (COMMON_PASSWORDS.has(lower)) {
    throw weak('Essa senha é muito comum. Escolha outra.');
  }
}
