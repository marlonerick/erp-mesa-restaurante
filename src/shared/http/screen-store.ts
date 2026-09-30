import { type RequestContext, requireSameStore } from '@/shared/kernel';

/** Nome do parâmetro com a loja que a tela mostra (`/api/salao?loja=<id>`). */
export const SCREEN_STORE_PARAM = 'loja';

/**
 * Leituras automáticas conferem a loja da TELA (achado I-4 da revisão da Etapa 7): se a pessoa
 * trocou de loja em outra aba, a tela aberta não pode passar a mostrar os dados da outra loja
 * debaixo do nome antigo. Lança `STORE_CHANGED` (409). Sem o parâmetro, não confere.
 */
export function requireScreenStore(request: Request, ctx: RequestContext): void {
  const expected = new URL(request.url).searchParams.get(SCREEN_STORE_PARAM);
  if (expected !== null) requireSameStore(ctx, expected);
}
