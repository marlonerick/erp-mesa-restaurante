'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import {
  deliverItemAction,
  removeItemAction,
  sendRoundAction,
} from '@/modules/orders/interface/actions';
import type { FloorView, ItemView, MenuItemView, OrderView } from '@/modules/orders/web';
import { cn } from '@/ui/cn';
import { FormMessage } from '@/ui/form-message';
import { formatBRL } from '@/ui/money';
import { SubmitButton } from '@/ui/submit-button';
import { useOrder, useRefreshAfter } from '../../live';
import { AddItemDialog } from './add-item-dialog';
import { CancelItemDialog } from './cancel-item-dialog';
import { OrderActions } from './order-actions';

export interface OrderPermissions {
  readonly add: boolean;
  readonly update: boolean;
  /** Tem `orders.cancel`; senão, o cancelamento pede o PIN do gerente. */
  readonly cancel: boolean;
}

const STATUS_BADGE: Readonly<Record<ItemView['status'], string>> = {
  PENDENTE: 'bg-atencao-claro text-atencao',
  ENVIADO: 'bg-azulejo-claro text-azulejo',
  EM_PREPARO: 'bg-azulejo-claro text-azulejo',
  PRONTO: 'bg-confirma-claro text-confirma',
  ENTREGUE: 'bg-louca text-tinta-suave',
  CANCELADO: 'bg-alerta-claro text-alerta line-through',
};

const time = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** A comanda (RN-ORD-05 a RN-ORD-20), para o celular do garçom (Q-15). Atualiza sozinha. */
export function OrderScreen({
  initial,
  menu,
  floor,
  storeId,
  can,
  limits,
}: {
  readonly initial: OrderView;
  readonly menu: readonly MenuItemView[];
  readonly floor: FloorView;
  readonly storeId: string;
  readonly can: OrderPermissions;
  readonly limits: { readonly notes: number; readonly quantity: number };
}) {
  const { data: order, isError } = useOrder(initial);
  const title = order.type === 'MESA' ? `Mesa ${order.label}` : `Balcão · ${order.label}`;
  const open = order.status === 'ABERTO';

  return (
    <div className="flex flex-col gap-6">
      <Link href="/salao" className="font-semibold text-azulejo underline">
        Voltar para o salão
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-tinta-suave">
          Conta {order.number} · aberta às{' '}
          <time dateTime={order.openedAt} suppressHydrationWarning>
            {time(order.openedAt)}
          </time>
          {order.guests ? ` · ${String(order.guests)} pessoas` : ''}
        </p>
        <p className="text-2xl font-bold" aria-live="polite">
          Subtotal {formatBRL(order.subtotalCents)}
        </p>
        <p className="text-sm text-tinta-suave">Taxa de serviço e descontos entram no caixa.</p>
      </header>

      {isError ? (
        <p
          role="status"
          className="rounded-md bg-atencao-claro px-4 py-2 font-semibold text-atencao"
        >
          Sem conexão com o servidor. Tentando de novo…
        </p>
      ) : null}

      {!open ? (
        <p
          role="status"
          className="rounded-md border-l-4 border-alerta bg-alerta-claro px-4 py-3 font-semibold text-alerta"
        >
          {order.status === 'CANCELADO'
            ? 'Esta conta foi encerrada (cancelada ou juntada em outra mesa).'
            : 'Esta conta já foi fechada.'}
        </p>
      ) : (
        <>
          {can.add ? (
            <AddItemDialog
              orderId={order.id}
              storeId={storeId}
              menu={menu}
              notesMax={limits.notes}
              quantityMax={limits.quantity}
            />
          ) : null}
          <PendingItems order={order} storeId={storeId} can={can} />
          {can.update ? <OrderActions order={order} floor={floor} storeId={storeId} /> : null}
        </>
      )}

      <section aria-labelledby="enviados" className="flex flex-col gap-4">
        <h2 id="enviados" className="text-2xl font-bold">
          Enviados
        </h2>
        {order.rounds.length === 0 ? (
          <p className="text-tinta-suave">Nada enviado ainda.</p>
        ) : (
          order.rounds.map((round) => (
            <div key={round.id} className="flex flex-col gap-2">
              <h3 className="font-bold">
                Rodada {round.number} ·{' '}
                <time dateTime={round.sentAt} suppressHydrationWarning>
                  {time(round.sentAt)}
                </time>
                {round.sentByName ? ` · ${round.sentByName}` : ''}
              </h3>
              <ul
                className="flex flex-col border-t border-borda"
                aria-label={`Rodada ${String(round.number)}`}
              >
                {round.items.map((item) => (
                  <li key={item.id} className="flex flex-col gap-2 border-b border-borda py-3">
                    <ItemLine item={item} />
                    {open ? (
                      <div className="flex flex-wrap items-center gap-3">
                        {item.status === 'PRONTO' && can.update ? (
                          <DeliverButton item={item} storeId={storeId} />
                        ) : null}
                        {item.status !== 'CANCELADO' && can.update ? (
                          <CancelItemDialog
                            item={item}
                            storeId={storeId}
                            needsManager={!can.cancel}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function ItemLine({ item }: { readonly item: ItemView }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        <span className={cn('text-lg font-bold', item.status === 'CANCELADO' && 'line-through')}>
          {item.quantity} × {item.productName}
        </span>
        {item.modifiers.length > 0 ? (
          <span className="text-tinta-suave">
            {item.modifiers.map((extra) => extra.name).join(', ')}
          </span>
        ) : null}
        {item.notes ? <span className="font-semibold">Obs.: {item.notes}</span> : null}
        {item.cancelReason ? (
          <span className="text-sm text-alerta">Motivo: {item.cancelReason}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn('rounded-md px-2 py-0.5 text-sm font-semibold', STATUS_BADGE[item.status])}
        >
          {item.statusLabel}
        </span>
        <span className="font-semibold">{formatBRL(item.totalCents)}</span>
      </div>
    </div>
  );
}

/**
 * Itens ainda não enviados + "Enviar para a cozinha" (RN-ORD-10). O envio manda exatamente os itens
 * que esta tela mostra e uma chave que se repete se a internet cair (RN-ORD-11).
 */
function PendingItems({
  order,
  storeId,
  can,
}: {
  readonly order: OrderView;
  readonly storeId: string;
  readonly can: OrderPermissions;
}) {
  const [state, action] = useActionState(sendRoundAction, null);
  useRefreshAfter(state);
  const shown = order.pending.map((item) => item.id).join(',');
  // Uma chave por intenção: muda quando a lista muda ou quando o envio deu certo
  const [key, setKey] = useState(() => ({ shown, value: uuidv7(), sentAt: 0 }));
  const submittedAt = state?.submittedAt ?? 0;
  if (key.shown !== shown || key.sentAt !== submittedAt) {
    setKey({ shown, value: uuidv7(), sentAt: submittedAt });
  }

  return (
    <section aria-labelledby="pendentes" className="flex flex-col gap-3">
      <h2 id="pendentes" className="text-2xl font-bold">
        Não enviados
      </h2>
      {order.pending.length === 0 ? (
        <p className="text-tinta-suave">Nenhum item esperando envio.</p>
      ) : (
        <ul className="flex flex-col border-t border-borda" aria-label="Itens não enviados">
          {order.pending.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 border-b border-borda py-3">
              <ItemLine item={item} />
              {can.update ? <RemoveButton item={item} storeId={storeId} /> : null}
            </li>
          ))}
        </ul>
      )}
      {order.pending.length > 0 && can.add ? (
        <form action={action}>
          <input type="hidden" name="expectedStoreId" value={storeId} />
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="idempotencyKey" value={key.value} />
          {order.pending.map((item) => (
            <input key={item.id} type="hidden" name="itemId" value={item.id} />
          ))}
          <SubmitButton pendingText="Enviando…" className="w-full">
            Enviar para a cozinha ({order.pending.length})
          </SubmitButton>
        </form>
      ) : null}
      <FormMessage state={state} />
    </section>
  );
}

function RemoveButton({ item, storeId }: { readonly item: ItemView; readonly storeId: string }) {
  const [state, action] = useActionState(removeItemAction, null);
  useRefreshAfter(state);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name="itemId" value={item.id} />
      <SubmitButton
        pendingText="Removendo…"
        variant="quiet"
        className="min-h-12 self-start px-2"
        aria-label={`Remover ${item.productName}`}
      >
        Remover
      </SubmitButton>
      {state?.error ? (
        <p role="alert" className="text-sm font-semibold text-alerta">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function DeliverButton({ item, storeId }: { readonly item: ItemView; readonly storeId: string }) {
  const [state, action] = useActionState(deliverItemAction, null);
  useRefreshAfter(state);
  return (
    <form action={action}>
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name="itemId" value={item.id} />
      <SubmitButton
        pendingText="Entregando…"
        variant="secondary"
        aria-label={`Entregar ${item.productName}`}
      >
        Entregar
      </SubmitButton>
      {state?.error ? (
        <p role="alert" className="text-sm font-semibold text-alerta">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
