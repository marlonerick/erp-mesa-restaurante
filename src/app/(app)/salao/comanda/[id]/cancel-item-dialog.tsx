'use client';

import { type SyntheticEvent, useActionState, useState, useTransition } from 'react';
import { requestElevationAction } from '@/modules/auth/interface/actions';
import { cancelItemAction } from '@/modules/orders/interface/actions';
import type { ItemView } from '@/modules/orders/web';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/ui/dialog';
import { TextAreaField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { useRefreshAfter } from '../../live';

/**
 * Cancelar item já enviado (RN-ORD-12): motivo obrigatório. Quem não tem `orders.cancel` (garçom,
 * caixa) pede ao gerente para digitar usuário e PIN neste aparelho; a autorização vale uma vez e
 * por 60 s (RN-AUTHZ-06) e é usada na mesma hora.
 */
export function CancelItemDialog({
  item,
  storeId,
  needsManager,
}: {
  readonly item: ItemView;
  readonly storeId: string;
  readonly needsManager: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, cancelling] = useActionState(cancelItemAction, null);
  const [authorizing, startTransition] = useTransition();
  const pending = authorizing || cancelling;
  const [authError, setAuthError] = useState<string | null>(null);
  useRefreshAfter(state);

  const text = (data: FormData, name: string) => {
    const value = data.get(name);
    return typeof value === 'string' ? value : '';
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAuthError(null);
    startTransition(async () => {
      if (needsManager) {
        const grant = await requestElevationAction({
          authorizerUsername: text(data, 'authorizer'),
          pin: text(data, 'pin'),
          permission: 'orders.cancel',
        });
        if (!grant.ok) {
          setAuthError(grant.error.message);
          return;
        }
        data.set('grantToken', grant.data.grantToken);
      }
      // O PIN não segue para o cancelamento: só o token de uso único
      data.delete('pin');
      data.delete('authorizer');
      action(data);
    });
  };

  const done = Boolean(state?.success);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setAuthError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="quiet"
          className="min-h-12 px-2"
          aria-label={`Cancelar ${item.productName}`}
        >
          Cancelar
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Cancelar ${String(item.quantity)} × ${item.productName}`}
        description={
          item.status === 'ENVIADO'
            ? 'A cozinha ainda não começou: os insumos voltam para o estoque.'
            : 'O item já foi preparado ou entregue: os insumos contam como perda.'
        }
      >
        {done ? (
          <div className="flex flex-col gap-4">
            <FormMessage state={state} />
            <Button
              onClick={() => {
                setOpen(false);
              }}
            >
              Fechar
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-5">
            <input type="hidden" name="expectedStoreId" value={storeId} />
            <input type="hidden" name="itemId" value={item.id} />
            <TextAreaField
              label="Motivo"
              name="reason"
              required
              maxLength={200}
              rows={2}
              hint="Ex.: cliente desistiu, saiu errado, demorou demais"
            />
            {needsManager ? (
              <fieldset className="flex flex-col gap-4 rounded-md border-2 border-borda p-4">
                <legend className="px-1 font-semibold">Autorização do gerente</legend>
                <TextField
                  label="Usuário do gerente"
                  name="authorizer"
                  autoComplete="off"
                  autoCapitalize="none"
                  required
                />
                <TextField
                  label="PIN do gerente"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  required
                />
              </fieldset>
            ) : null}
            {authError ? <FormMessage state={{ error: authError }} /> : null}
            <FormMessage state={state?.error ? state : null} />
            <Button type="submit" variant="danger" disabled={pending} aria-busy={pending}>
              {pending ? 'Cancelando…' : 'Cancelar item'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
