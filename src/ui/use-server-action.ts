'use client';

import { useActionState, useCallback } from 'react';
import type { FormState } from '@/shared/errors/form-state';

/** Mensagem quando o pedido não chega ao servidor (internet caiu — risco R-10). */
export const CONNECTION_LOST =
  'Sem conexão com o servidor. Confira a internet e toque de novo — o que já foi enviado não se repete.';

/** Redirecionamento e "não encontrado" do Next viajam como erro: não são falha de rede. */
function isNextSignal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof error.digest === 'string' &&
    error.digest.startsWith('NEXT_')
  );
}

/**
 * `useActionState` com tolerância a queda de internet (Etapa 10). Sem isto, uma Server Action que
 * não chega ao servidor derruba a tela inteira na página de erro do Next. Aqui o formulário mostra
 * "Sem conexão…" e MANTÉM o `submittedAt` anterior — a chave de idempotência por intenção
 * (`useIntentKey`) continua a mesma, então tocar de novo não duplica o que talvez já tenha chegado
 * (pedido, pagamento — R-03).
 */
export function useServerAction<S extends FormState>(
  action: (previous: S | null, formData: FormData) => Promise<S>,
) {
  const tolerant = useCallback(
    async (previous: S | null, formData: FormData): Promise<S | null> => {
      try {
        return await action(previous, formData);
      } catch (error) {
        if (isNextSignal(error)) throw error;
        const lost: FormState = {
          error: CONNECTION_LOST,
          ...(previous?.submittedAt === undefined ? {} : { submittedAt: previous.submittedAt }),
        };
        return lost as S;
      }
    },
    [action],
  );
  return useActionState(tolerant, null);
}
