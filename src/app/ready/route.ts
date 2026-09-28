import { checkApplicationReadiness } from '@/shared/http/readiness';

// Readiness: o sistema pode receber tráfego (banco respondendo). 200 ou 503 (README B.8).
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const { status, body } = await checkApplicationReadiness();
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
