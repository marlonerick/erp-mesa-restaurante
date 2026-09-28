import { describe, expect, it } from 'vitest';
import { hashRequest } from '@/shared/idempotency/request-hash';
import { Money } from '@/shared/kernel';

describe('hashRequest — identidade da requisição idempotente', () => {
  it('a ordem das chaves não muda o hash', () => {
    expect(hashRequest('x.y', { a: 1, b: { c: 2, d: 3 } })).toBe(
      hashRequest('x.y', { b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('operações diferentes geram hashes diferentes', () => {
    expect(hashRequest('x.y', {})).not.toBe(hashRequest('x.z', {}));
  });

  it('datas diferentes geram hashes diferentes (revisão: Date virava {})', () => {
    expect(hashRequest('x.y', { at: new Date('2026-01-01T00:00:00Z') })).not.toBe(
      hashRequest('x.y', { at: new Date('2027-01-01T00:00:00Z') }),
    );
    expect(hashRequest('x.y', { at: new Date('2026-01-01T00:00:00Z') })).toBe(
      hashRequest('x.y', { at: new Date('2026-01-01T00:00:00Z') }),
    );
  });

  it('aceita bigint sem quebrar e distingue valores', () => {
    expect(hashRequest('x.y', { micros: 45_900n })).not.toBe(
      hashRequest('x.y', { micros: 45_901n }),
    );
    // bigint não se confunde com o texto de mesmo valor
    expect(hashRequest('x.y', { micros: 45_900n })).not.toBe(
      hashRequest('x.y', { micros: '45900' }),
    );
  });

  it('usa o toJSON de tipos de valor (Money vira centavos)', () => {
    expect(hashRequest('x.y', { total: Money.fromCents(1100) })).toBe(
      hashRequest('x.y', { total: 1100 }),
    );
  });

  it('trata campos undefined como ausentes, como o JSON', () => {
    expect(hashRequest('x.y', { a: 1, b: undefined })).toBe(hashRequest('x.y', { a: 1 }));
  });

  it.each([
    ['Map', new Map([['a', 1]])],
    ['Set', new Set([1])],
    ['função', () => 1],
    ['número infinito', Number.POSITIVE_INFINITY],
  ])('recusa %s com erro claro em vez de ignorar', (_label, value) => {
    expect(() => hashRequest('x.y', { value })).toThrow(TypeError);
  });
});
