import { describe, expect, it } from 'vitest';
import { stripSecrets } from '@/modules/audit/domain/audit-event';

describe('stripSecrets — segredos nunca vão para a auditoria (RN-AUDIT-05)', () => {
  it.each([
    'password',
    'pin',
    'passwordHash',
    'pin_hash',
    'sessionToken',
    'pinCode',
    'passwordNew',
    'sessionCookie',
    'secretKey',
    'grantTokenValue',
    'Authorization',
  ])('remove o campo %s', (key) => {
    expect(stripSecrets({ [key]: 'valor', name: 'Ana' })).toEqual({ name: 'Ana' });
  });

  it.each(['change', 'name', 'username', 'reason', 'method', 'expiresAt', 'roles', 'spinner'])(
    'mantém o campo %s',
    (key) => {
      expect(stripSecrets({ [key]: 'x' })).toEqual({ [key]: 'x' });
    },
  );

  it('remove segredos em objetos aninhados e preserva o resto', () => {
    expect(stripSecrets({ user: { name: 'Ana', pinHash: 'h' }, change: 'OWN_PIN' })).toEqual({
      user: { name: 'Ana' },
      change: 'OWN_PIN',
    });
  });
});
