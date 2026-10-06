'use client';

import { setStoreStatusAction } from '@/modules/organizations/interface/actions';
import { ActionForm } from '@/ui/action-form';
import { CheckboxField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';
import { useServerAction } from '@/ui/use-server-action';

interface Props {
  readonly store: {
    readonly id: string;
    readonly name: string;
    readonly version: number;
    readonly status: 'ATIVO' | 'INATIVO';
    readonly inUse: boolean;
  };
}

/** Desativar (RN-ORG-06) ou reativar a loja. */
export function StoreStatusForm({ store }: Props) {
  const [state, action] = useServerAction(setStoreStatusAction);
  const active = store.status === 'ATIVO';

  return (
    <section className="flex flex-col gap-4 border-t-2 border-borda pt-6">
      <h2 className="text-2xl font-bold">{active ? 'Desativar loja' : 'Reativar loja'}</h2>
      <p className="text-tinta-suave">
        {active
          ? 'A loja some da troca de lojas e ninguém consegue trabalhar nela. Nada é apagado: vendas, estoque e auditoria continuam guardados.'
          : 'A loja volta a aceitar login e aparece na troca de lojas.'}
      </p>
      {active && store.inUse ? (
        <p className="font-semibold">Para desativar esta loja, troque antes para outra loja.</p>
      ) : (
        <ActionForm key={store.version} action={action} state={state} noValidate={false}>
          <FormMessage state={state} />
          <input type="hidden" name="storeId" value={store.id} />
          <input type="hidden" name="version" value={store.version} />
          <input type="hidden" name="status" value={active ? 'INATIVO' : 'ATIVO'} />
          {active ? (
            <CheckboxField
              name="confirm"
              required
              label={`Confirmo que ninguém poderá mais trabalhar na loja ${store.name}`}
            />
          ) : null}
          <SubmitButton
            pendingText={active ? 'Desativando…' : 'Reativando…'}
            variant={active ? 'danger' : 'secondary'}
          >
            {active ? 'Desativar loja' : 'Reativar loja'}
          </SubmitButton>
        </ActionForm>
      )}
    </section>
  );
}
