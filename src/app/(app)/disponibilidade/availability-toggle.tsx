'use client';

import { useActionState } from 'react';
import { setAvailabilityAction } from '@/modules/catalog/interface/actions';
import { cn } from '@/ui/cn';
import { SubmitButton } from '@/ui/submit-button';

/**
 * Um produto do cardápio da loja com o botão "Acabou" / "Voltou" (RN-CAT-09). Botão grande, para
 * o celular da cozinha; a situação aparece em texto, não só em cor.
 */
export function AvailabilityToggle({
  product,
  storeId,
}: {
  readonly product: {
    readonly id: string;
    readonly name: string;
    readonly price: string;
    readonly available: boolean;
  };
  readonly storeId: string;
}) {
  const [state, action] = useActionState(setAvailabilityAction, null);
  return (
    <li
      className={cn(
        'flex flex-col gap-2 border-b border-borda py-3',
        !product.available && 'bg-alerta-claro/50',
      )}
    >
      <form action={action} className="flex flex-wrap items-center justify-between gap-3">
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="name" value={product.name} />
        <input type="hidden" name="expectedStoreId" value={storeId} />
        <input type="hidden" name="available" value={product.available ? 'false' : 'true'} />
        <span className="flex min-w-0 flex-col">
          <span className="text-lg font-bold">{product.name}</span>
          <span className={product.available ? 'text-tinta-suave' : 'font-semibold text-alerta'}>
            {product.available ? product.price : `Esgotado · ${product.price}`}
          </span>
        </span>
        <SubmitButton
          pendingText="Salvando…"
          // Vermelho só no que está esgotado: a lista normal não parece um alarme
          variant={product.available ? 'secondary' : 'primary'}
          // O leitor de tela ouve o produto junto, começando pelo texto visível: "Acabou: X-Burger"
          aria-label={`${product.available ? 'Acabou' : 'Voltou'}: ${product.name}`}
        >
          {product.available ? 'Acabou' : 'Voltou'}
        </SubmitButton>
      </form>
      {state?.error ? (
        <p role="alert" className="font-semibold text-alerta">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}
