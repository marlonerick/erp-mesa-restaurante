import { describe, expect, it } from 'vitest';
import { DomainError, isDomainError, isId, newId, parseId, systemClock } from '@/shared/kernel';
import { FakeClock } from '../../../support/fake-clock';

describe('Id (UUIDv7, ADR-0004)', () => {
  it('gera UUIDv7 válidos e únicos', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('gera ids em ordem crescente de criação', () => {
    const ids = Array.from({ length: 100 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
  });

  it('normaliza para minúsculas ao validar', () => {
    const id = newId();
    expect(parseId(id.toUpperCase())).toBe(id);
  });

  it.each(['', 'abc', '123e4567-e89b-42d3-a456-426614174000'])(
    'rejeita texto que não é UUIDv7 (%s)',
    (value) => {
      expect(() => parseId(value)).toThrow(expect.objectContaining({ code: 'INVALID_ID' }));
      expect(isId(value)).toBe(false);
    },
  );

  it('isId reconhece ids válidos e rejeita não-strings', () => {
    expect(isId(newId())).toBe(true);
    expect(isId(42)).toBe(false);
  });
});

describe('DomainError', () => {
  it('carrega código, tipo e detalhes', () => {
    const error = new DomainError(
      'ORDER_ALREADY_CLOSED',
      'Esta conta já foi fechada.',
      'BUSINESS_RULE',
      {
        orderId: 'x',
      },
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DomainError');
    expect(error.code).toBe('ORDER_ALREADY_CLOSED');
    expect(error.kind).toBe('BUSINESS_RULE');
    expect(error.details).toEqual({ orderId: 'x' });
    expect(isDomainError(error)).toBe(true);
    expect(isDomainError(new Error('x'))).toBe(false);
  });

  it('usa BUSINESS_RULE e detalhes vazios por padrão', () => {
    const error = new DomainError('SOME_RULE', 'Mensagem.');
    expect(error.kind).toBe('BUSINESS_RULE');
    expect(error.details).toEqual({});
  });

  it('exige código em MAIÚSCULAS_COM_SUBLINHADO', () => {
    expect(() => new DomainError('orderClosed', 'x')).toThrow(/código/);
  });
});

describe('Clock', () => {
  it('relógio do sistema devolve a hora atual', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('FakeClock permite fixar e avançar o tempo nos testes', () => {
    const clock = new FakeClock(new Date('2026-03-15T04:30:00.000Z'));
    expect(clock.now().toISOString()).toBe('2026-03-15T04:30:00.000Z');

    clock.advanceMinutes(90);
    expect(clock.now().toISOString()).toBe('2026-03-15T06:00:00.000Z');

    clock.set(new Date('2026-01-01T00:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('FakeClock devolve cópias (não permite alterar o relógio por fora)', () => {
    const clock = new FakeClock(new Date('2026-03-15T00:00:00.000Z'));
    clock.now().setFullYear(2000);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });
});
