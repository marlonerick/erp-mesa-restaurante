import { describe, expect, it } from 'vitest';
import { newId, requireSameStore } from '@/shared/kernel';
import { FakeRequestContext } from '../../../support/request-context';

describe('requireSameStore (achado I-5 da revisão da Etapa 3)', () => {
  it('aceita quando a tela foi aberta na loja ativa', () => {
    const ctx = new FakeRequestContext();
    expect(() => {
      requireSameStore(ctx, ctx.storeId);
    }).not.toThrow();
  });

  it('recusa quando a pessoa trocou de loja em outra aba', () => {
    const ctx = new FakeRequestContext();
    expect(() => {
      requireSameStore(ctx, newId());
    }).toThrow(expect.objectContaining({ code: 'STORE_CHANGED', kind: 'CONFLICT' }));
  });
});
