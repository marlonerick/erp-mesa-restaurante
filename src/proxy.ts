import { type NextRequest, NextResponse } from 'next/server';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/shared/http/request-id';

/**
 * Executado antes de toda requisição (Next.js 16: "proxy", antigo "middleware").
 * Garante um requestId, repassado ao servidor e devolvido ao cliente para rastrear erros.
 */
export function proxy(request: NextRequest): NextResponse {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
