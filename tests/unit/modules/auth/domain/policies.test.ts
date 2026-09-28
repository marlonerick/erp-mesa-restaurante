import { describe, expect, it } from 'vitest';
import { validateNewPassword } from '@/modules/auth/domain/password-policy';
import { validatePin } from '@/modules/auth/domain/pin-policy';
import {
  ABSOLUTE_LIFETIME_SECONDS,
  idleTimeoutFor,
  sessionStatus,
  shouldTouchSession,
} from '@/modules/auth/domain/session-policy';
import { rateLimitWindowStart } from '@/modules/auth/domain/rate-limit-policy';
import { DomainError } from '@/shared/kernel';

describe('política de senha (RN-AUTH-08)', () => {
  it('aceita senha com 8 caracteres ou mais', () => {
    expect(() => {
      validateNewPassword('Mesa@2026', 'joao');
    }).not.toThrow();
  });

  it.each([
    ['curta demais', 'Ab1!xyz', 'pelo menos 8'],
    ['longa demais', 'a'.repeat(129), 'no máximo 128'],
    ['igual ao usuário', 'joaozinho', 'diferente do seu usuário'],
    ['igual ao usuário com maiúsculas', 'JOAOZINHO', 'diferente do seu usuário'],
    ['senha óbvia', '12345678', 'muito comum'],
    ['senha óbvia com maiúsculas', 'SENHA123', 'muito comum'],
  ])('recusa senha %s', (_label, password, reason) => {
    expect(() => {
      validateNewPassword(password, 'joaozinho');
    }).toThrow(
      expect.objectContaining({
        code: 'WEAK_PASSWORD',
        message: expect.stringContaining(reason) as string,
      }),
    );
  });
});

describe('política de PIN (RN-AUTH-10)', () => {
  it.each(['482915', '739104', '102938'])('aceita %s', (pin) => {
    expect(() => {
      validatePin(pin);
    }).not.toThrow();
  });

  it.each(['12345', '1234567', '12a456', '111111', '123456', '654321', '345678', '987654', ''])(
    'recusa %j',
    (pin) => {
      expect(() => {
        validatePin(pin);
      }).toThrow(expect.objectContaining({ code: 'INVALID_PIN_FORMAT' }));
    },
  );
});

describe('política de sessão (RN-AUTH-06)', () => {
  const login = new Date('2026-03-14T21:00:00.000Z'); // 18:00 em São Paulo
  const minutes = (n: number) => new Date(login.getTime() + n * 60_000);
  const session = (overrides: Partial<Parameters<typeof sessionStatus>[0]> = {}) => ({
    createdAt: login,
    lastSeenAt: login,
    expiresAt: new Date(login.getTime() + ABSOLUTE_LIFETIME_SECONDS * 1000),
    idleTimeoutSeconds: idleTimeoutFor(false),
    revokedAt: null,
    ...overrides,
  });

  it('12 h sem uso em aparelho individual; 3 min em compartilhado', () => {
    expect(idleTimeoutFor(false)).toBe(12 * 60 * 60);
    expect(idleTimeoutFor(true)).toBe(3 * 60);
    expect(ABSOLUTE_LIFETIME_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  it('ativa dentro do tempo', () => {
    expect(sessionStatus(session(), minutes(12 * 60))).toBe('ATIVA');
  });

  it('expira 1 minuto depois de 12 h sem uso', () => {
    expect(sessionStatus(session(), minutes(12 * 60 + 1))).toBe('EXPIRADA_INATIVIDADE');
  });

  it('aparelho compartilhado expira após 3 min sem uso', () => {
    const shared = session({ idleTimeoutSeconds: idleTimeoutFor(true) });
    expect(sessionStatus(shared, minutes(3))).toBe('ATIVA');
    expect(sessionStatus(shared, minutes(4))).toBe('EXPIRADA_INATIVIDADE');
  });

  it('expira após 7 dias mesmo com uso recente', () => {
    const usedRecently = session({ lastSeenAt: minutes(7 * 24 * 60 - 5) });
    expect(sessionStatus(usedRecently, minutes(7 * 24 * 60 + 1))).toBe('EXPIRADA_LIMITE');
  });

  it('sessão encerrada vale como encerrada em qualquer horário', () => {
    expect(sessionStatus(session({ revokedAt: minutes(1) }), minutes(2))).toBe('ENCERRADA');
  });

  it('renova o "último uso" no máximo a cada 5 min (ou 1/3 do tempo de inatividade)', () => {
    const individual = session();
    expect(shouldTouchSession(individual, minutes(4))).toBe(false);
    expect(shouldTouchSession(individual, minutes(5))).toBe(true);

    const shared = session({ idleTimeoutSeconds: idleTimeoutFor(true) });
    expect(shouldTouchSession(shared, new Date(login.getTime() + 59_000))).toBe(false);
    expect(shouldTouchSession(shared, minutes(1))).toBe(true);
  });
});

describe('janela do limite de tentativas (RN-AUTH-04)', () => {
  it('agrupa tentativas em janelas de 15 minutos', () => {
    const window = 15 * 60;
    expect(rateLimitWindowStart(new Date('2026-03-14T21:07:59.999Z'), window).toISOString()).toBe(
      '2026-03-14T21:00:00.000Z',
    );
    expect(rateLimitWindowStart(new Date('2026-03-14T21:15:00.000Z'), window).toISOString()).toBe(
      '2026-03-14T21:15:00.000Z',
    );
  });
});

it('erros de política são erros de validação', () => {
  try {
    validatePin('1');
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).kind).toBe('VALIDATION');
  }
});
