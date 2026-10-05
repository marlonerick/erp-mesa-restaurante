import { NextResponse } from 'next/server';
import { currentSession } from '@/modules/auth/web';
import { reports, toDashboardView } from '@/modules/reports/web';
import { INTERNAL_ERROR_STATUS, toErrorResponse } from '@/shared/errors/error-response';
import { requireScreenStore } from '@/shared/http/screen-store';
import { getLogger } from '@/shared/logger/logger';

export const dynamic = 'force-dynamic';

/**
 * Painel do dia para a atualização automática (30 s — RN-REP-03). Não renova a sessão: a tela
 * aberta sozinha não mantém um aparelho compartilhado desbloqueado (RN-AUTH-15).
 */
export async function GET(request: Request) {
  const session = await currentSession({ touch: false });
  if (!session || session.mustChangePassword) {
    return NextResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  try {
    requireScreenStore(request, session.context);
    const dashboard = await reports().dashboard(session.context);
    return NextResponse.json(toDashboardView(dashboard), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const response = toErrorResponse(error, session.context.requestId);
    if (response.status === INTERNAL_ERROR_STATUS) {
      getLogger().error({ err: error, requestId: session.context.requestId }, 'Erro inesperado');
    }
    return NextResponse.json(response.body, { status: response.status });
  }
}
