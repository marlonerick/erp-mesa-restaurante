'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { openCounterAction, openTableAction } from '@/modules/orders/interface/actions';
import type { FloorTableView, FloorView, OrderSummaryView } from '@/modules/orders/web';
import { releaseTableAction } from '@/modules/tables/interface/actions';
import { ActionForm } from '@/ui/action-form';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Dialog, DialogContent, DialogTrigger } from '@/ui/dialog';
import { TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { formatBRL } from '@/ui/money';
import { SubmitButton } from '@/ui/submit-button';
import { isGone, useFloor, useRefreshAfter } from './live';

/** Cor de cada estado — sempre junto com o texto (quem não distingue cores lê o estado). */
const STATUS_STYLE: Readonly<Record<FloorTableView['status'], string>> = {
  LIVRE: 'border-confirma bg-white',
  OCUPADA: 'border-azulejo bg-azulejo-claro',
  AGUARDANDO_CONTA: 'border-atencao bg-atencao-claro',
  EM_PAGAMENTO: 'border-atencao bg-atencao-claro',
  LIMPEZA: 'border-borda bg-louca border-dashed',
};

const STATUS_TEXT: Readonly<Record<FloorTableView['status'], string>> = {
  LIVRE: 'text-confirma',
  OCUPADA: 'text-azulejo',
  AGUARDANDO_CONTA: 'text-atencao',
  EM_PAGAMENTO: 'text-atencao',
  LIMPEZA: 'text-tinta-suave',
};

export interface FloorPermissions {
  readonly open: boolean;
  readonly release: boolean;
}

/** Mapa do salão (RN-TAB-07): mesas por área + pedidos de balcão; atualiza sozinho. */
export function FloorBoard({
  initial,
  storeId,
  can,
}: {
  readonly initial: FloorView;
  readonly storeId: string;
  readonly can: FloorPermissions;
}) {
  const { data, isError, error } = useFloor(initial);
  const areas = new Map<string, FloorTableView[]>();
  for (const table of data.tables) {
    const key = table.area ?? 'Outras mesas';
    areas.set(key, [...(areas.get(key) ?? []), table]);
  }

  return (
    <div className="flex flex-col gap-8">
      {isError ? (
        <p
          role="status"
          className="rounded-md bg-atencao-claro px-4 py-2 font-semibold text-atencao"
        >
          {isGone(error)
            ? 'Você não tem mais acesso a este salão. Recarregue a página.'
            : 'Sem conexão com o servidor. Tentando de novo…'}
        </p>
      ) : null}

      {data.tables.length === 0 ? (
        <p className="text-lg">
          Nenhuma mesa cadastrada nesta loja. O gerente cadastra em Administração → Mesas.
        </p>
      ) : (
        [...areas].map(([area, rows]) => (
          <section key={area} aria-label={area} className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">{area}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {rows.map((table) => (
                <li key={table.id}>
                  <TableCard table={table} storeId={storeId} can={can} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <section aria-labelledby="balcao" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="balcao" className="text-xl font-bold">
            Balcão
          </h2>
          {can.open ? <NewCounterDialog storeId={storeId} /> : null}
        </div>
        {data.counter.length === 0 ? (
          <p className="text-tinta-suave">Nenhum pedido de balcão aberto.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Pedidos de balcão">
            {data.counter.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/salao/comanda/${order.id}`}
                  className="flex min-h-16 flex-col rounded-lg border-2 border-azulejo bg-azulejo-claro px-4 py-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-azulejo"
                >
                  <span className="text-lg font-bold">{order.label}</span>
                  <OrderLine order={order} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OrderLine({ order }: { readonly order: OrderSummaryView }) {
  return (
    <span className="flex flex-wrap gap-x-3 text-sm">
      <span>Conta {order.number}</span>
      <span className="font-semibold">{formatBRL(order.subtotalCents)}</span>
      {order.readyCount > 0 ? (
        <span className="font-semibold text-confirma">{order.readyCount} pronto(s)</span>
      ) : null}
      {order.pendingCount > 0 ? (
        <span className="font-semibold text-atencao">{order.pendingCount} não enviado(s)</span>
      ) : null}
    </span>
  );
}

const cardClass =
  'flex min-h-28 w-full flex-col items-start gap-1 rounded-lg border-2 px-3 py-3 text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-azulejo';

function TableCard({
  table,
  storeId,
  can,
}: {
  readonly table: FloorTableView;
  readonly storeId: string;
  readonly can: FloorPermissions;
}) {
  const header = (
    <>
      <span className="text-2xl font-bold">Mesa {table.number}</span>
      <span className={cn('font-semibold', STATUS_TEXT[table.status])}>{table.statusLabel}</span>
    </>
  );
  if (table.order) {
    return (
      <Link
        href={`/salao/comanda/${table.order.id}`}
        className={cn(cardClass, STATUS_STYLE[table.status])}
      >
        {header}
        <OrderLine order={table.order} />
      </Link>
    );
  }
  if (table.status === 'LIVRE' && can.open) {
    return <OpenTableDialog table={table} storeId={storeId} />;
  }
  if (table.status === 'LIMPEZA' && can.release) {
    return <ReleaseTable table={table} storeId={storeId} />;
  }
  return (
    <div className={cn(cardClass, STATUS_STYLE[table.status])}>
      {header}
      <span className="text-sm text-tinta-suave">{table.seats} lugares</span>
    </div>
  );
}

function OpenTableDialog({
  table,
  storeId,
}: {
  readonly table: FloorTableView;
  readonly storeId: string;
}) {
  const [state, action] = useActionState(openTableAction, null);
  useRefreshAfter(state);
  return (
    <Dialog>
      <DialogTrigger className={cn(cardClass, STATUS_STYLE.LIVRE, 'hover:bg-confirma-claro')}>
        <span className="text-2xl font-bold">Mesa {table.number}</span>
        <span className="font-semibold text-confirma">{table.statusLabel}</span>
        <span className="text-sm text-tinta-suave">{table.seats} lugares · toque para abrir</span>
      </DialogTrigger>
      <DialogContent title={`Abrir a mesa ${table.number}`}>
        <ActionForm action={action} state={state}>
          <input type="hidden" name="expectedStoreId" value={storeId} />
          <input type="hidden" name="tableId" value={table.id} />
          <TextField
            label="Pessoas (opcional)"
            name="guests"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            autoComplete="off"
          />
          <FormMessage state={state} />
          <SubmitButton pendingText="Abrindo…">Abrir mesa</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseTable({
  table,
  storeId,
}: {
  readonly table: FloorTableView;
  readonly storeId: string;
}) {
  const [state, action] = useActionState(releaseTableAction, null);
  useRefreshAfter(state);
  return (
    <form action={action} className={cn(cardClass, STATUS_STYLE.LIMPEZA)}>
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name="tableId" value={table.id} />
      <span className="text-2xl font-bold">Mesa {table.number}</span>
      <span className="font-semibold text-tinta-suave">{table.statusLabel}</span>
      <SubmitButton
        pendingText="Liberando…"
        variant="secondary"
        className="mt-1 w-full"
        aria-label={`Liberar a mesa ${table.number}`}
      >
        Liberar
      </SubmitButton>
      {state?.error ? (
        <p role="alert" className="text-sm font-semibold text-alerta">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function NewCounterDialog({ storeId }: { readonly storeId: string }) {
  const [state, action] = useActionState(openCounterAction, null);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Novo pedido de balcão</Button>
      </DialogTrigger>
      <DialogContent title="Novo pedido de balcão" description="Um nome para chamar o cliente.">
        <ActionForm action={action} state={state}>
          <input type="hidden" name="expectedStoreId" value={storeId} />
          <TextField
            label="Nome do cliente"
            name="label"
            required
            maxLength={40}
            autoComplete="off"
            errors={state?.fieldErrors?.label}
          />
          <FormMessage state={state} />
          <SubmitButton pendingText="Abrindo…">Abrir pedido</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
