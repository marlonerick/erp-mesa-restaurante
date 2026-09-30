import { NextResponse } from 'next/server';
import { currentSession } from '@/modules/auth/web';
import { kitchen, toKitchenView } from '@/modules/kitchen/web';
import { INTERNAL_ERROR_STATUS, toErrorResponse } from '@/shared/errors/error-response';
import { getLogger } from '@/shared/logger/logger';

export const dynamic = 'force-dynamic';

/**
 * Fila da cozinha para a atualização automática (polling de 3 s — ADR-0005, RN-KDS-11). Não renova
 * a sessão: a tela aberta sozinha não mantém um aparelho compartilhado desbloqueado (RN-AUTH-15).
 */
export async function GET() {
  const session = await currentSession({ touch: false });
  // Sem sessão, ou com senha provisória (só a troca de senha é permitida — RN-AUTH-09)
  if (!session || session.mustChangePassword) {
    return NextResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  try {
    const board = await kitchen().board(session.context);
    return NextResponse.json(toKitchenView(board), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const response = toErrorResponse(error, session.context.requestId);
    if (response.status === INTERNAL_ERROR_STATUS) {
      getLogger().error({ err: error, requestId: session.context.requestId }, 'Erro inesperado');
    }
    return NextResponse.json(response.body, { status: response.status });
  }
}
