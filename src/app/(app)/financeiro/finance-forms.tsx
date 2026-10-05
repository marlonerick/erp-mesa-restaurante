'use client';

import { useActionState, useState } from 'react';
import {
  cancelEntryAction,
  createCategoryAction,
  createEntryAction,
  payEntryAction,
  setCategoryActiveAction,
} from '@/modules/finance/interface/actions';
import type { CategoryView, EntryView, FinanceType } from '@/modules/finance/web';
import { ActionForm } from '@/ui/action-form';
import { SelectField, TextAreaField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { useIntentKey } from '@/ui/intent-key';
import { SubmitButton } from '@/ui/submit-button';

const TYPES: readonly { value: FinanceType; label: string }[] = [
  { value: 'DESPESA', label: 'Despesa (saída)' },
  { value: 'RECEITA', label: 'Receita (entrada)' },
];

/** Novo lançamento manual (RN-FIN-04). A categoria Vendas fica de fora: vem do caixa. */
export function NewEntryForm({
  storeId,
  today,
  categories,
}: {
  readonly storeId: string;
  readonly today: string;
  readonly categories: readonly CategoryView[];
}) {
  const [state, action] = useActionState(createEntryAction, null);
  const key = useIntentKey(state);
  const [type, setType] = useState<FinanceType>('DESPESA');
  const [paid, setPaid] = useState(false);
  const options = categories
    .filter((category) => category.type === type && category.active && !category.system)
    .map((category) => ({ value: category.id, label: category.name }));
  return (
    <ActionForm action={action} state={state} resetOnSuccess>
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 font-semibold">Tipo</legend>
        {TYPES.map((option) => (
          <label
            key={option.value}
            className="flex min-h-12 cursor-pointer items-center gap-2 rounded-md border-2 border-borda bg-white px-3 has-checked:border-azulejo has-checked:bg-azulejo-claro"
          >
            <input
              type="radio"
              name="type"
              value={option.value}
              checked={type === option.value}
              onChange={() => {
                setType(option.value);
              }}
              className="size-5 accent-azulejo"
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      {/* Remonta ao trocar o tipo: a categoria escolhida antes não vale para o outro tipo */}
      <SelectField key={type} label="Categoria" name="categoryId" options={options} required />
      <TextField
        label="Descrição"
        name="description"
        maxLength={120}
        required
        hint="Ex.: Conta de luz de março, Fornecedor de carnes"
      />
      <TextField label="Valor (R$)" name="amount" inputMode="decimal" required />
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 font-semibold">Situação</legend>
        {[
          { value: 'PREVISTO', label: type === 'DESPESA' ? 'A pagar' : 'A receber' },
          { value: 'PAGO', label: type === 'DESPESA' ? 'Já paga' : 'Já recebida' },
        ].map((option) => (
          <label
            key={option.value}
            className="flex min-h-12 cursor-pointer items-center gap-2 rounded-md border-2 border-borda bg-white px-3 has-checked:border-azulejo has-checked:bg-azulejo-claro"
          >
            <input
              type="radio"
              name="status"
              value={option.value}
              checked={paid === (option.value === 'PAGO')}
              onChange={() => {
                setPaid(option.value === 'PAGO');
              }}
              className="size-5 accent-azulejo"
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <TextField
        label={paid ? 'Data do pagamento' : 'Vencimento'}
        name="date"
        type="date"
        defaultValue={today}
        required
      />
      <TextField
        label="Competência (opcional)"
        name="competenceDate"
        type="date"
        hint="Mês a que a conta se refere. Em branco, vale a data acima."
      />
      <FormMessage state={state} />
      <SubmitButton pendingText="Lançando…">Lançar</SubmitButton>
    </ActionForm>
  );
}

/** Pagar (a pagar → pago) e cancelar com motivo. Receita do caixa não tem ações (RN-FIN-03). */
export function EntryActions({
  entry,
  storeId,
  today,
}: {
  readonly entry: EntryView;
  readonly storeId: string;
  readonly today: string;
}) {
  if (entry.automatic || entry.status === 'CANCELADO') return null;
  return (
    <div className="flex flex-col gap-3">
      {entry.status === 'PREVISTO' ? (
        <PayForm entry={entry} storeId={storeId} today={today} />
      ) : null}
      <details className="group">
        <summary className="cursor-pointer font-semibold text-alerta underline">
          Cancelar lançamento
        </summary>
        <CancelForm entry={entry} storeId={storeId} />
      </details>
    </div>
  );
}

function PayForm({
  entry,
  storeId,
  today,
}: {
  readonly entry: EntryView;
  readonly storeId: string;
  readonly today: string;
}) {
  const [state, action] = useActionState(payEntryAction, null);
  return (
    <ActionForm action={action} state={state} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name="entryId" value={entry.id} />
      <input type="hidden" name="version" value={entry.version} />
      <TextField
        label={entry.type === 'DESPESA' ? 'Pago em' : 'Recebido em'}
        name="paidDate"
        type="date"
        defaultValue={today}
        required
      />
      <SubmitButton pendingText="Registrando…" variant="secondary">
        {entry.type === 'DESPESA' ? 'Marcar como paga' : 'Marcar como recebida'}
      </SubmitButton>
      <FormMessage state={state} />
    </ActionForm>
  );
}

function CancelForm({ entry, storeId }: { readonly entry: EntryView; readonly storeId: string }) {
  const [state, action] = useActionState(cancelEntryAction, null);
  return (
    <ActionForm action={action} state={state} className="mt-3 flex max-w-md flex-col gap-3">
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name="entryId" value={entry.id} />
      <input type="hidden" name="version" value={entry.version} />
      <TextAreaField label="Motivo" name="reason" rows={2} maxLength={200} required />
      <FormMessage state={state} />
      <SubmitButton pendingText="Cancelando…" variant="danger">
        Cancelar lançamento
      </SubmitButton>
    </ActionForm>
  );
}

export function NewCategoryForm({ storeId }: { readonly storeId: string }) {
  const [state, action] = useActionState(createCategoryAction, null);
  return (
    <ActionForm action={action} state={state} resetOnSuccess>
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <SelectField label="Tipo" name="type" options={TYPES} />
      <TextField label="Nome" name="name" maxLength={60} required hint="Ex.: Marketing" />
      <FormMessage state={state} />
      <SubmitButton pendingText="Criando…" variant="secondary">
        Criar categoria
      </SubmitButton>
    </ActionForm>
  );
}

export function CategoryToggle({
  category,
  storeId,
}: {
  readonly category: CategoryView;
  readonly storeId: string;
}) {
  const [state, action] = useActionState(setCategoryActiveAction, null);
  if (category.system) return <span className="text-sm text-tinta-suave">Do sistema</span>;
  return (
    <ActionForm action={action} state={state} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name="categoryId" value={category.id} />
      <input type="hidden" name="version" value={category.version} />
      <input type="hidden" name="active" value={category.active ? '0' : '1'} />
      <SubmitButton pendingText="Salvando…" variant="secondary">
        {category.active ? `Desativar ${category.name}` : `Reativar ${category.name}`}
      </SubmitButton>
      <FormMessage state={state} />
    </ActionForm>
  );
}
