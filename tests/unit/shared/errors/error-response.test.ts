import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { actionFailure, actionSuccess } from '@/shared/errors/action-result';
import { toErrorResponse } from '@/shared/errors/error-response';
import { DomainError, type DomainErrorKind } from '@/shared/kernel';

const REQUEST_ID = 'req-123';

describe('toErrorResponse — padrão global de erro (README B.8)', () => {
  it.each<[DomainErrorKind, number]>([
    ['VALIDATION', 400],
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['BUSINESS_RULE', 422],
    ['RATE_LIMITED', 429],
  ])('erro de domínio %s vira HTTP %i', (kind, status) => {
    const response = toErrorResponse(new DomainError('SOME_CODE', 'Mensagem.', kind), REQUEST_ID);
    expect(response.status).toBe(status);
  });

  it('mantém código, mensagem, detalhes e requestId', () => {
    const error = new DomainError(
      'ORDER_ALREADY_CLOSED',
      'Esta conta já foi fechada.',
      'BUSINESS_RULE',
      {
        orderNumber: 12,
      },
    );

    expect(toErrorResponse(error, REQUEST_ID)).toEqual({
      status: 422,
      body: {
        code: 'ORDER_ALREADY_CLOSED',
        message: 'Esta conta já foi fechada.',
        details: { orderNumber: 12 },
        requestId: REQUEST_ID,
      },
    });
  });

  it('erro de validação do Zod vira 400 com os campos inválidos', () => {
    const schema = z.object({
      amountCents: z.number().int().positive(),
      items: z.array(z.string()),
    });
    const result = schema.safeParse({ amountCents: -1, items: [1] });
    if (result.success) throw new Error('esperava falha de validação');

    const response = toErrorResponse(result.error, REQUEST_ID);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.message).toBe('Dados inválidos. Verifique os campos informados.');
    expect(Object.keys(response.body.details.fields as object).sort()).toEqual([
      'amountCents',
      'items.0',
    ]);
  });

  it('erro inesperado vira 500 genérico, sem expor mensagem, stack ou SQL', () => {
    const response = toErrorResponse(
      new Error("ER_NO_SUCH_TABLE: Table 'erp.customer_order' doesn't exist"),
      REQUEST_ID,
    );

    expect(response).toEqual({
      status: 500,
      body: {
        code: 'INTERNAL_ERROR',
        message: 'Ocorreu um erro inesperado. Tente novamente em instantes.',
        details: {},
        requestId: REQUEST_ID,
      },
    });
    expect(JSON.stringify(response)).not.toMatch(/customer_order|ER_NO_SUCH_TABLE|at /);
  });

  it('valores lançados que não são Error também viram 500', () => {
    expect(toErrorResponse('texto solto', REQUEST_ID).status).toBe(500);
  });
});

describe('ActionResult (retorno das Server Actions)', () => {
  const logger = () => ({ error: vi.fn() });

  it('sucesso carrega os dados', () => {
    expect(actionSuccess({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
  });

  it('falha esperada não é registrada como erro no log', () => {
    const log = logger();
    const result = actionFailure(new DomainError('X_RULE', 'Regra.'), REQUEST_ID, log);

    expect(result).toEqual({
      ok: false,
      error: { code: 'X_RULE', message: 'Regra.', details: {}, requestId: REQUEST_ID },
    });
    expect(log.error).not.toHaveBeenCalled();
  });

  it('falha inesperada é registrada no log com o erro original', () => {
    const log = logger();
    const original = new Error('conexão perdida');
    const result = actionFailure(original, REQUEST_ID, log);

    expect(result.ok).toBe(false);
    expect(log.error).toHaveBeenCalledWith(
      { err: original, requestId: REQUEST_ID },
      'Erro inesperado',
    );
  });
});
