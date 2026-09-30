'use client';

import { type ReactNode, useActionState, useState } from 'react';
import {
  cancelOrderAction,
  detachAction,
  joinAction,
  requestBillAction,
  transferAction,
} from '@/modules/orders/interface/actions';
import type { FloorView, OrderView } from '@/modules/orders/web';
import type { FormState } from '@/shared/errors/form-state';
import { ActionForm } from '@/ui/action-form';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/ui/dialog';
import { SelectField, TextAreaField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';
import { useFloor, useRefreshAfter } from '../../live';

type Action = (previous: FormState | null, formData: FormData) => Promise<FormState>;

/** Campos que toda ação sobre a conta inteira manda: loja da tela, conta e versão (RN-ORD-21). */
function Scope({ order, storeId }: { readonly order: OrderView; readonly storeId: string }) {
  return (
    <>
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="version" value={order.version} />
    </>
  );
}

/** Janela com um formulário da conta; mostra o resultado e fecha no "Fechar". */
function OrderDialog({
  label,
  title,
  description,
  action,
  children,
  submitText,
  pendingText,
  variant = 'secondary',
  submitVariant = 'primary',
}: {
  readonly label: string;
  readonly title: string;
  readonly description?: string;
  readonly action: Action;
  readonly children: (open: boolean) => ReactNode;
  readonly submitText: string;
  readonly pendingText: string;
  readonly variant?: 'secondary' | 'danger' | 'quiet';
  readonly submitVariant?: 'primary' | 'danger';
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>{label}</Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        {/* O corpo só existe com a janela aberta: cada abertura começa sem mensagem antiga */}
        <OrderDialogBody
          action={action}
          submitText={submitText}
          pendingText={pendingText}
          submitVariant={submitVariant}
          onClose={() => {
            setOpen(false);
          }}
        >
          {children(open)}
        </OrderDialogBody>
      </DialogContent>
    </Dialog>
  );
}

function OrderDialogBody({
  action,
  children,
  submitText,
  pendingText,
  submitVariant,
  onClose,
}: {
  readonly action: Action;
  readonly children: ReactNode;
  readonly submitText: string;
  readonly pendingText: string;
  readonly submitVariant: 'primary' | 'danger';
  readonly onClose: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  useRefreshAfter(state);
  return (
    <>
      {state?.success ? (
        <div className="flex flex-col gap-4">
          <FormMessage state={state} />
          <Button onClick={onClose}>Fechar</Button>
        </div>
      ) : (
        <ActionForm action={formAction} state={state}>
          {children}
          <FormMessage state={state} />
          <SubmitButton pendingText={pendingText} variant={submitVariant}>
            {submitText}
          </SubmitButton>
        </ActionForm>
      )}
    </>
  );
}

/** Mesas para transferir/juntar, lidas do mapa ao abrir a janela. */
function useTableChoices(floor: FloorView, storeId: string, open: boolean) {
  const { data } = useFloor(floor, storeId, open);
  return data.tables;
}

export function OrderActions({
  order,
  floor,
  storeId,
}: {
  readonly order: OrderView;
  readonly floor: FloorView;
  readonly storeId: string;
}) {
  const [billState, billAction] = useActionState(requestBillAction, null);
  useRefreshAfter(billState);
  const isTable = order.type === 'MESA';
  const waiting = order.tables.some((table) => table.status === 'AGUARDANDO_CONTA');
  const nothingSent = order.rounds.every((round) =>
    round.items.every((item) => item.status === 'CANCELADO'),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {isTable && !waiting ? (
          <form action={billAction}>
            <Scope order={order} storeId={storeId} />
            <SubmitButton pendingText="Pedindo…" variant="secondary">
              Pedir a conta
            </SubmitButton>
          </form>
        ) : null}

        {isTable ? (
          <OrderDialog
            label="Transferir"
            title="Transferir para outra mesa"
            description="A conta inteira vai para a mesa escolhida; esta fica livre."
            action={transferAction}
            submitText="Transferir"
            pendingText="Transferindo…"
          >
            {(open) => <TransferFields order={order} floor={floor} storeId={storeId} open={open} />}
          </OrderDialog>
        ) : null}

        {isTable ? (
          <OrderDialog
            label="Juntar mesa"
            title="Juntar outra mesa nesta conta"
            description="Mesa livre passa a usar esta conta. Mesa com conta aberta: os itens dela vêm para cá."
            action={joinAction}
            submitText="Juntar"
            pendingText="Juntando…"
          >
            {(open) => <JoinFields order={order} floor={floor} storeId={storeId} open={open} />}
          </OrderDialog>
        ) : null}

        {isTable && order.tables.length > 1 ? (
          <OrderDialog
            label="Separar mesa"
            title="Separar uma mesa da conta"
            description="A mesa escolhida fica livre; a conta continua nas outras."
            action={detachAction}
            submitText="Separar"
            pendingText="Separando…"
          >
            {() => (
              <>
                <Scope order={order} storeId={storeId} />
                <SelectField
                  label="Mesa"
                  name="tableId"
                  options={order.tables.map((table) => ({
                    value: table.id,
                    label: `Mesa ${table.number}`,
                  }))}
                />
              </>
            )}
          </OrderDialog>
        ) : null}

        {nothingSent ? (
          <OrderDialog
            label="Cancelar conta"
            title="Cancelar esta conta"
            description="Nada foi enviado para a cozinha. Os itens não enviados são apagados e a mesa fica livre."
            action={cancelOrderAction}
            submitText="Cancelar conta"
            pendingText="Cancelando…"
            variant="quiet"
            submitVariant="danger"
          >
            {() => (
              <>
                <Scope order={order} storeId={storeId} />
                <TextAreaField label="Motivo (opcional)" name="reason" maxLength={200} rows={2} />
              </>
            )}
          </OrderDialog>
        ) : null}
      </div>
      <FormMessage state={billState} />
    </div>
  );
}

function TransferFields({
  order,
  floor,
  storeId,
  open,
}: {
  readonly order: OrderView;
  readonly floor: FloorView;
  readonly storeId: string;
  readonly open: boolean;
}) {
  const tables = useTableChoices(floor, storeId, open);
  const free = tables.filter((table) => table.status === 'LIVRE');
  return (
    <>
      <Scope order={order} storeId={storeId} />
      {order.tables.length > 1 ? (
        <SelectField
          label="Sair da mesa"
          name="fromTableId"
          options={order.tables.map((table) => ({
            value: table.id,
            label: `Mesa ${table.number}`,
          }))}
        />
      ) : (
        <input type="hidden" name="fromTableId" value={order.tables[0]?.id ?? ''} />
      )}
      {free.length === 0 ? (
        <p className="font-semibold text-atencao">Nenhuma mesa livre agora.</p>
      ) : (
        <SelectField
          label="Para a mesa"
          name="toTableId"
          options={free.map((table) => ({
            value: table.id,
            label: `Mesa ${table.number}${table.area ? ` · ${table.area}` : ''}`,
          }))}
        />
      )}
    </>
  );
}

function JoinFields({
  order,
  floor,
  storeId,
  open,
}: {
  readonly order: OrderView;
  readonly floor: FloorView;
  readonly storeId: string;
  readonly open: boolean;
}) {
  const tables = useTableChoices(floor, storeId, open);
  const mine = new Set(order.tables.map((table) => table.id));
  const options = tables.filter(
    (table) =>
      !mine.has(table.id) &&
      (table.status === 'LIVRE' ||
        table.status === 'OCUPADA' ||
        table.status === 'AGUARDANDO_CONTA'),
  );
  return (
    <>
      <Scope order={order} storeId={storeId} />
      {options.length === 0 ? (
        <p className="font-semibold text-atencao">Nenhuma mesa pode ser juntada agora.</p>
      ) : (
        <SelectField
          label="Mesa"
          name="tableId"
          options={options.map((table) => ({
            value: table.id,
            label: `Mesa ${table.number} · ${table.statusLabel}${table.order ? ` (conta ${String(table.order.number)})` : ''}`,
          }))}
        />
      )}
    </>
  );
}
