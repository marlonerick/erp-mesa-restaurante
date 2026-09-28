import { type NextRequest, NextResponse } from 'next/server';
import { buildContentSecurityPolicy, generateNonce } from '@/shared/http/content-security-policy';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/shared/http/request-id';

export const CSP_HEADER = 'content-security-policy';
export const NONCE_HEADER = 'x-nonce';

/**
 * Executado antes de toda requisição (Next.js 16: "proxy", antigo "middleware").
 * - requestId: repassado ao servidor e devolvido ao cliente para rastrear erros.
 * - CSP com nonce novo a cada resposta (o Next aplica o nonce aos próprios scripts).
 */
export function proxy(request: NextRequest): NextResponse {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const csp = buildContentSecurityPolicy({
    nonce: generateNonce(),
    development: process.env.NODE_ENV !== 'production',
    https: request.nextUrl.protocol === 'https:',
  });
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1] ?? '';

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  headers.set(NONCE_HEADER, nonce);
  headers.set(CSP_HEADER, csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
