import { NextResponse } from 'next/server';
import { currentSession } from '@/modules/auth/web';
import { orders, toFloorView } from '@/modules/orders/web';
import { INTERNAL_ERROR_STATUS, toErrorResponse } from '@/shared/errors/error-response';
import { requireScreenStore } from '@/shared/http/screen-store';
import { getLogger } from '@/shared/logger/logger';

export const dynamic = 'force-dynamic';

/**
 * Mapa do salão para a atualização automática (polling de 5 s — ADR-0005). Não renova a sessão:
 * a tela aberta sozinha não mantém um aparelho compartilhado desbloqueado (RN-AUTH-15).
 */
export async function GET(request: Request) {
  const session = await currentSession({ touch: false });
  // Sem sessão, ou com senha provisória (só a troca de senha é permitida — RN-AUTH-09)
  if (!session || session.mustChangePassword) {
    return NextResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  try {
    // A loja da TELA (achado I-4 da revisão da Etapa 7): outra aba trocou de loja → 409
    requireScreenStore(request, session.context);
    const floor = await orders().floor(session.context);
    return NextResponse.json(toFloorView(floor), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const response = toErrorResponse(error, session.context.requestId);
    if (response.status === INTERNAL_ERROR_STATUS) {
      getLogger().error({ err: error, requestId: session.context.requestId }, 'Erro inesperado');
    }
    return NextResponse.json(response.body, { status: response.status });
  }
}
