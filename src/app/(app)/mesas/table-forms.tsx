'use client';

import { useActionState } from 'react';
import { createTableAction, updateTableAction } from '@/modules/tables/interface/actions';
import { ActionForm } from '@/ui/action-form';
import { CheckboxField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';

/** Cadastro de mesa (RN-TAB-02): número, área e lugares. */
export function NewTableForm({ storeId }: { readonly storeId: string }) {
  const [state, action] = useActionState(createTableAction, null);
  return (
    <ActionForm action={action} state={state} resetOnSuccess>
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <TextField
        label="Número"
        name="number"
        required
        maxLength={10}
        autoComplete="off"
        hint='Como aparece no salão: "10", "V1", "Varanda 2"'
        errors={state?.fieldErrors?.number}
      />
      <TextField
        label="Área (opcional)"
        name="area"
        maxLength={40}
        hint="Agrupa as mesas no mapa, ex.: Salão, Varanda"
      />
      <TextField
        label="Lugares"
        name="seats"
        type="number"
        inputMode="numeric"
        min={1}
        max={99}
        defaultValue={4}
        required
        errors={state?.fieldErrors?.seats}
      />
      <FormMessage state={state} />
      <SubmitButton pendingText="Cadastrando…">Cadastrar mesa</SubmitButton>
    </ActionForm>
  );
}

export function EditTableForm({
  table,
  storeId,
}: {
  readonly table: {
    readonly id: string;
    readonly version: number;
    readonly number: string;
    readonly area: string | null;
    readonly seats: number;
    readonly active: boolean;
  };
  readonly storeId: string;
}) {
  const [state, action] = useActionState(updateTableAction, null);
  return (
    <ActionForm action={action} state={state}>
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name="tableId" value={table.id} />
      <input type="hidden" name="version" value={table.version} />
      <TextField label="Número" name="number" required maxLength={10} defaultValue={table.number} />
      <TextField
        label="Área (opcional)"
        name="area"
        maxLength={40}
        defaultValue={table.area ?? ''}
      />
      <TextField
        label="Lugares"
        name="seats"
        type="number"
        inputMode="numeric"
        min={1}
        max={99}
        defaultValue={table.seats}
        required
      />
      <CheckboxField
        label="Mesa ativa"
        name="active"
        defaultChecked={table.active}
        hint="Desativada, a mesa sai do mapa do salão. Só dá para desativar uma mesa livre."
      />
      <FormMessage state={state} />
      <SubmitButton pendingText="Salvando…">Salvar mesa</SubmitButton>
    </ActionForm>
  );
}
