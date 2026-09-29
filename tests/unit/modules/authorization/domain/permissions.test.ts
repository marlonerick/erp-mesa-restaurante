import { describe, expect, it } from 'vitest';
import {
  canAssignRole,
  resolveStorePermissions,
} from '@/modules/authorization/domain/effective-permissions';
import { normalizeUsername } from '@/modules/users/domain/username';
import { hasPermission, isPermission, PERMISSIONS, requirePermission } from '@/shared/kernel';
import { FakeRequestContext } from '../../../../support/request-context';

const store = { id: 's-centro', companyId: 'c-1', organizationId: 'o-1' };

describe('catálogo de permissões', () => {
  it('tem as 34 permissões do README + terminals.manage (E3-1), sem repetição', () => {
    expect(PERMISSIONS).toHaveLength(35);
    expect(new Set(PERMISSIONS).size).toBe(35);
    expect(isPermission('terminals.manage')).toBe(true);
    expect(isPermission('orders.cancel')).toBe(true);
    expect(isPermission('orders.delete')).toBe(false);
  });
});

describe('permissões efetivas na loja (RN-AUTHZ-02)', () => {
  it('soma os perfis cujo escopo cobre a loja: loja, empresa e organização', () => {
    const permissions = resolveStorePermissions(
      [
        { scopeType: 'STORE', scopeId: 's-centro', permissions: ['orders.read'] },
        { scopeType: 'COMPANY', scopeId: 'c-1', permissions: ['products.read'] },
        { scopeType: 'ORGANIZATION', scopeId: 'o-1', permissions: ['reports.read'] },
      ],
      store,
    );
    expect([...permissions].sort()).toEqual(['orders.read', 'products.read', 'reports.read']);
  });

  it('ignora perfis de outra loja, empresa ou organização', () => {
    const permissions = resolveStorePermissions(
      [
        { scopeType: 'STORE', scopeId: 's-praia', permissions: ['users.create'] },
        { scopeType: 'COMPANY', scopeId: 'c-2', permissions: ['users.update'] },
        { scopeType: 'ORGANIZATION', scopeId: 'o-2', permissions: ['users.disable'] },
      ],
      store,
    );
    expect(permissions.size).toBe(0);
  });
});

describe('anti-escalada (RN-AUTHZ-05)', () => {
  it('só atribui perfil cujas permissões quem atribui já tem', () => {
    const manager = new Set(PERMISSIONS.filter((p) => p !== 'stores.manage'));
    expect(canAssignRole(manager, ['orders.read', 'orders.create'])).toBe(true);
    expect(canAssignRole(manager, [...PERMISSIONS])).toBe(false);
  });
});

describe('verificação de permissão no caso de uso (RN-AUTHZ-03)', () => {
  it('libera quem tem a permissão e recusa quem não tem', () => {
    const ctx = new FakeRequestContext({ permissions: ['orders.read'] });
    expect(hasPermission(ctx, 'orders.read')).toBe(true);
    expect(() => {
      requirePermission(ctx, 'orders.read');
    }).not.toThrow();
    expect(() => {
      requirePermission(ctx, 'users.create');
    }).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        kind: 'FORBIDDEN',
        message: 'Você não tem permissão para esta ação.',
      }),
    );
  });
});

describe('nome de usuário (RN-USERS-02)', () => {
  it.each([
    ['joao', 'joao'],
    ['  Joao.Silva ', 'joao.silva'],
    ['ana_2', 'ana_2'],
    ['caixa-01', 'caixa-01'],
  ])('normaliza %j para %j', (input, expected) => {
    expect(normalizeUsername(input)).toBe(expected);
  });

  it.each(['ab', 'a'.repeat(51), 'joão', 'joao silva', 'joao@x', ''])('recusa %j', (input) => {
    expect(() => normalizeUsername(input)).toThrow(
      expect.objectContaining({ code: 'INVALID_USERNAME' }),
    );
  });
});
