import { DomainError } from '@/shared/kernel';

/** Após este número de PINs errados seguidos, o PIN trava até o login com senha (RN-AUTH-12). */
export const PIN_MAX_ATTEMPTS = 5;

const SIX_DIGITS = /^\d{6}$/;

function isSequence(pin: string, step: 1 | -1): boolean {
  for (let index = 1; index < pin.length; index += 1) {
    if (Number(pin[index]) - Number(pin[index - 1]) !== step) {
      return false;
    }
  }
  return true;
}

/** PIN de 6 dígitos sem repetição total nem sequência (RN-AUTH-10, decisão E2-4). */
export function validatePin(pin: string): void {
  const valid =
    SIX_DIGITS.test(pin) && new Set(pin).size > 1 && !isSequence(pin, 1) && !isSequence(pin, -1);
  if (!valid) {
    throw new DomainError(
      'INVALID_PIN_FORMAT',
      'O PIN deve ter 6 dígitos, sem sequências nem números repetidos.',
      'VALIDATION',
    );
  }
}
