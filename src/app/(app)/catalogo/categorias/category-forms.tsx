'use client';

import { useActionState } from 'react';
import {
  createCategoryAction,
  moveCategoryAction,
  updateCategoryAction,
} from '@/modules/catalog/interface/actions';
import { ActionForm } from '@/ui/action-form';
import { CheckboxField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';

/** Cadastro de categoria na empresa da loja ativa (RN-CAT-02). */
export function NewCategoryForm({ storeId }: { readonly storeId: string }) {
  const [state, action] = useActionState(createCategoryAction, null);
  return (
    <ActionForm action={action} state={state} resetOnSuccess>
      <FormMessage state={state} />
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <TextField
        label="Nome"
        name="name"
        hint="Ex.: Lanches, Bebidas, Sobremesas. Entra no fim da lista."
        required
        errors={state?.fieldErrors?.name}
      />
      <SubmitButton pendingText="Salvando…" variant="secondary">
        Cadastrar categoria
      </SubmitButton>
    </ActionForm>
  );
}

/** Nome e situação da categoria (RN-CAT-02, RN-CAT-03). */
export function EditCategoryForm({
  category,
}: {
  readonly category: {
    readonly id: string;
    readonly version: number;
    readonly name: string;
    readonly active: boolean;
  };
}) {
  const [state, action] = useActionState(updateCategoryAction, null);
  return (
    <ActionForm key={category.version} action={action} state={state}>
      <FormMessage state={state} />
      <input type="hidden" name="categoryId" value={category.id} />
      <input type="hidden" name="version" value={category.version} />
      <TextField
        label="Nome"
        name="name"
        defaultValue={category.name}
        required
        errors={state?.fieldErrors?.name}
      />
      <CheckboxField
        label="Ativa"
        name="active"
        defaultChecked={category.active}
        hint="Desativada, a categoria e os produtos dela saem do cardápio (nada é apagado)."
      />
      <SubmitButton pendingText="Salvando…">Salvar categoria</SubmitButton>
    </ActionForm>
  );
}

/** Botões "Subir"/"Descer" de uma categoria. */
export function MoveButtons({
  category,
  first,
  last,
}: {
  readonly category: { readonly id: string; readonly name: string };
  readonly first: boolean;
  readonly last: boolean;
}) {
  const [state, action] = useActionState(moveCategoryAction, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="categoryId" value={category.id} />
      <SubmitButton
        name="direction"
        value="UP"
        pendingText="Subindo…"
        variant="secondary"
        disabled={first}
        aria-label={`Subir ${category.name}`}
      >
        Subir
      </SubmitButton>
      <SubmitButton
        name="direction"
        value="DOWN"
        pendingText="Descendo…"
        variant="secondary"
        disabled={last}
        aria-label={`Descer ${category.name}`}
      >
        Descer
      </SubmitButton>
      {state?.error ? (
        <span role="alert" className="text-sm font-semibold text-alerta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
