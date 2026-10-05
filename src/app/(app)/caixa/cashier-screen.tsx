'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  cashMovementAction,
  closeCashAction,
  openCashAction,
} from '@/modules/cashier/interface/actions';
import type { CashierView } from '@/modules/cashier/web';
import { ActionForm } from '@/ui/action-form';
import { TextAreaField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { useIntentKey } from '@/ui/intent-key';
import { formatBRL } from '@/ui/money';
import { SubmitButton } from '@/ui/submit-button';

const time = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

interface Props {
  readonly view: CashierView;
  readonly storeId: string;
  readonly can: { readonly open: boolean; readonly movement: boolean; readonly close: boolean };
}

export function CashierScreen({ view, storeId, can }: Props) {
  const session = view.session;
  if (!session) {
    return can.open ? (
      <OpenForm storeId={storeId} />
    ) : (
      <p className="text-tinta-suave">O caixa deste terminal está fechado.</p>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <section
        aria-labelledby="aberto"
        className="flex flex-col gap-2 rounded-md bg-white p-4 shadow-sm"
      >
        <h2 id="aberto" className="text-xl font-bold">
          Caixa aberto
        </h2>
        <p>
          Aberto às{' '}
          <time dateTime={session.openedAt} suppressHydrationWarning>
            {time(session.openedAt)}
          </time>
          {session.openedByName ? ` por ${session.openedByName}` : ''} · fundo de troco{' '}
          {formatBRL(session.openingAmountCents)}
        </p>
        <Link href="/pdv" className="self-start font-semibold text-azulejo underline">
          Ir para o PDV (receber contas)
        </Link>
      </section>

      {can.movement ? <MovementForm storeId={storeId} /> : null}

      <section aria-labelledby="movimentos" className="flex flex-col gap-3">
        <h2 id="movimentos" className="text-xl font-bold">
          Sangrias e suprimentos
        </h2>
        {session.movements.length === 0 ? (
          <p className="text-tinta-suave">Nenhuma sangria ou suprimento.</p>
        ) : (
          <ul className="flex flex-col border-t border-borda" aria-label="Sangrias e suprimentos">
            {session.movements.map((movement) => (
              <li
                key={movement.id}
                className="flex flex-wrap justify-between gap-2 border-b border-borda py-2"
              >
                <span>
                  <strong>{movement.type === 'SANGRIA' ? 'Sangria' : 'Suprimento'}</strong> ·{' '}
                  {movement.reason} · {movement.userName ?? ''}
                </span>
                <span className="font-semibold">{formatBRL(Math.abs(movement.amountCents))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {can.close ? (
        <CloseForm storeId={storeId} sessionId={session.id} version={session.version} />
      ) : null}
    </div>
  );
}

function OpenForm({ storeId }: { readonly storeId: string }) {
  const [state, action] = useActionState(openCashAction, null);
  const key = useIntentKey(state);
  return (
    <section aria-labelledby="abrir" className="flex max-w-md flex-col gap-4">
      <h2 id="abrir" className="text-xl font-bold">
        Abrir o caixa
      </h2>
      <ActionForm action={action} state={state}>
        <input type="hidden" name="expectedStoreId" value={storeId} />
        <input type="hidden" name="idempotencyKey" value={key} />
        <TextField
          label="Fundo de troco (R$)"
          name="opening"
          inputMode="decimal"
          defaultValue="0,00"
          hint="Dinheiro que já está na gaveta para dar troco."
          required
        />
        <FormMessage state={state} />
        <SubmitButton pendingText="Abrindo…">Abrir caixa</SubmitButton>
      </ActionForm>
    </section>
  );
}

function MovementForm({ storeId }: { readonly storeId: string }) {
  const [state, action] = useActionState(cashMovementAction, null);
  const key = useIntentKey(state);
  return (
    <section aria-labelledby="sangria" className="flex max-w-md flex-col gap-4">
      <h2 id="sangria" className="text-xl font-bold">
        Sangria ou suprimento
      </h2>
      <ActionForm action={action} state={state} resetOnSuccess>
        <input type="hidden" name="expectedStoreId" value={storeId} />
        <input type="hidden" name="idempotencyKey" value={key} />
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 font-semibold">Tipo</legend>
          {[
            ['SANGRIA', 'Sangria (retirar)'],
            ['SUPRIMENTO', 'Suprimento (colocar)'],
          ].map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-12 cursor-pointer items-center gap-2 rounded-md border-2 border-borda bg-white px-3 has-checked:border-azulejo has-checked:bg-azulejo-claro"
            >
              <input
                type="radio"
                name="type"
                value={value}
                defaultChecked={value === 'SANGRIA'}
                className="size-5 accent-azulejo"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <TextField label="Valor (R$)" name="amount" inputMode="decimal" required />
        <TextAreaField
          label="Motivo"
          name="reason"
          rows={2}
          maxLength={200}
          required
          hint="Ex.: depósito no cofre, troco extra"
        />
        <FormMessage state={state} />
        <SubmitButton pendingText="Registrando…" variant="secondary">
          Registrar
        </SubmitButton>
      </ActionForm>
    </section>
  );
}

function CloseForm({
  storeId,
  sessionId,
  version,
}: {
  readonly storeId: string;
  readonly sessionId: string;
  readonly version: number;
}) {
  const [state, action] = useActionState(closeCashAction, null);
  const key = useIntentKey(state);
  return (
    <section
      aria-labelledby="fechar"
      className="flex max-w-md flex-col gap-4 border-t-2 border-borda pt-6"
    >
      <h2 id="fechar" className="text-xl font-bold">
        Fechar o caixa
      </h2>
      <p className="text-tinta-suave">
        Conte o que há na gaveta e informe. O sistema não mostra o valor esperado antes: a diferença
        aparece depois de fechar (fechamento cego).
      </p>
      <ActionForm action={action} state={state}>
        <input type="hidden" name="expectedStoreId" value={storeId} />
        <input type="hidden" name="idempotencyKey" value={key} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="version" value={version} />
        <TextField label="Dinheiro na gaveta (R$)" name="DINHEIRO" inputMode="decimal" required />
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 font-semibold">Conferência opcional</legend>
          <TextField label="PIX (R$)" name="PIX" inputMode="decimal" />
          <TextField label="Cartão de crédito (R$)" name="CARTAO_CREDITO" inputMode="decimal" />
          <TextField label="Cartão de débito (R$)" name="CARTAO_DEBITO" inputMode="decimal" />
          <TextField label="Outro (R$)" name="OUTRO" inputMode="decimal" />
        </fieldset>
        <FormMessage state={state} />
        <SubmitButton pendingText="Fechando…" variant="danger">
          Fechar caixa
        </SubmitButton>
      </ActionForm>
    </section>
  );
}
