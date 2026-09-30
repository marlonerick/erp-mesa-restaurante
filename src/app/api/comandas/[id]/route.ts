import { NextResponse } from 'next/server';
import { currentSession } from '@/modules/auth/web';
import { orders, toOrderView } from '@/modules/orders/web';
import { INTERNAL_ERROR_STATUS, toErrorResponse } from '@/shared/errors/error-response';
import { hasPermission, parseId } from '@/shared/kernel';
import { getLogger } from '@/shared/logger/logger';

export const dynamic = 'force-dynamic';

/** Comanda para a atualização automática (5 s — ADR-0005), sem renovar a sessão (RN-AUTH-15). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession({ touch: false });
  // Sem sessão, ou com senha provisória (só a troca de senha é permitida — RN-AUTH-09)
  if (!session || session.mustChangePassword) {
    return NextResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  // Mesmas permissões da página da comanda (sugestão S-3 da revisão)
  if (!hasPermission(session.context, 'tables.read')) {
    return NextResponse.json({ code: 'FORBIDDEN' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const order = await orders().getOrder(session.context, parseId(id));
    return NextResponse.json(toOrderView(order), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const response = toErrorResponse(error, session.context.requestId);
    if (response.status === INTERNAL_ERROR_STATUS) {
      getLogger().error({ err: error, requestId: session.context.requestId }, 'Erro inesperado');
    }
    return NextResponse.json(response.body, { status: response.status });
  }
}
