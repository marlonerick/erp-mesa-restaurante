import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/shared/http/request-id';

describe('resolveRequestId', () => {
  it('reaproveita um id recebido em formato seguro', () => {
    expect(resolveRequestId('abc-123-DEF-456')).toBe('abc-123-DEF-456');
  });

  it.each([null, '', 'curto', 'x'.repeat(65), 'tem espaço aqui', 'quebra\nde-linha-no-log'])(
    'gera um novo id quando o recebido é ausente ou inseguro (%j)',
    (incoming) => {
      const id = resolveRequestId(incoming);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(id).not.toBe(incoming);
    },
  );
});

describe('proxy — requestId em toda requisição', () => {
  it('cria um requestId e devolve no cabeçalho da resposta', () => {
    const response = proxy(new NextRequest('http://localhost/qualquer'));
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('propaga o requestId recebido', () => {
    const request = new NextRequest('http://localhost/x', {
      headers: { [REQUEST_ID_HEADER]: 'id-vindo-do-balanceador' },
    });
    expect(proxy(request).headers.get(REQUEST_ID_HEADER)).toBe('id-vindo-do-balanceador');
  });
});
