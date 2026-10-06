'use client';

import {
  createModifierAction,
  createModifierGroupAction,
  updateModifierAction,
  updateModifierGroupAction,
} from '@/modules/catalog/interface/actions';
import { ActionForm } from '@/ui/action-form';
import { CheckboxField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';
import { useServerAction } from '@/ui/use-server-action';

interface GroupValues {
  readonly name: string;
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly active: boolean;
}

/** Cadastro e edição do grupo de adicionais (RN-CAT-11). */
export function ModifierGroupForm({
  values,
  group,
  storeId,
  maxLimit,
}: {
  readonly values: GroupValues;
  /** Edição: grupo e versão lida. Cadastro: loja da tela. */
  readonly group?: { readonly id: string; readonly version: number };
  readonly storeId?: string;
  readonly maxLimit: number;
}) {
  const [state, action] = useServerAction(
    group ? updateModifierGroupAction : createModifierGroupAction,
  );
  const errors = state?.fieldErrors;
  return (
    <ActionForm key={group?.version} action={action} state={state}>
      <FormMessage state={state} />
      {group ? (
        <>
          <input type="hidden" name="groupId" value={group.id} />
          <input type="hidden" name="version" value={group.version} />
        </>
      ) : null}
      {storeId ? <input type="hidden" name="expectedStoreId" value={storeId} /> : null}
      <TextField
        label="Nome do grupo"
        name="name"
        defaultValue={values.name}
        hint="A pergunta que o garçom faz. Ex.: Ponto da carne, Extras, Molhos."
        required
        errors={errors?.name}
      />
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Mínimo de escolhas"
          name="minSelect"
          type="number"
          inputMode="numeric"
          min={0}
          max={maxLimit}
          defaultValue={values.minSelect}
          hint="0 = opcional"
          errors={errors?.minSelect}
        />
        <TextField
          label="Máximo de escolhas"
          name="maxSelect"
          type="number"
          inputMode="numeric"
          min={1}
          max={maxLimit}
          defaultValue={values.maxSelect}
          hint={`De 1 a ${String(maxLimit)}`}
          errors={errors?.maxSelect}
        />
      </div>
      {group ? (
        <CheckboxField
          label="Ativo"
          name="active"
          defaultChecked={values.active}
          hint="Desativado, o grupo deixa de aparecer nos produtos."
        />
      ) : null}
      <SubmitButton pendingText="Salvando…" variant={group ? 'primary' : 'secondary'}>
        {group ? 'Salvar grupo' : 'Cadastrar grupo'}
      </SubmitButton>
    </ActionForm>
  );
}

/** Nova opção no grupo, com preço extra único na empresa (RN-CAT-12). */
export function NewModifierForm({
  groupId,
  storeId,
}: {
  readonly groupId: string;
  /** Loja da tela: recusa se a sessão trocou de loja em outra aba (RN-CAT-01). */
  readonly storeId: string;
}) {
  const [state, action] = useServerAction(createModifierAction);
  return (
    <ActionForm action={action} state={state} resetOnSuccess>
      <FormMessage state={state} />
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <TextField
        label="Nome da opção"
        name="name"
        hint="Ex.: Bacon, Ao ponto"
        required
        errors={state?.fieldErrors?.name}
      />
      <TextField
        label="Preço extra (R$)"
        name="price"
        inputMode="decimal"
        hint="Ex.: 5,00. Em branco = sem custo. O mesmo em todas as lojas."
        errors={state?.fieldErrors?.price}
      />
      <SubmitButton pendingText="Salvando…" variant="secondary">
        Incluir opção
      </SubmitButton>
    </ActionForm>
  );
}

/** Uma opção já cadastrada: nome, preço e situação. */
export function ModifierRow({
  modifier,
}: {
  readonly modifier: {
    readonly id: string;
    readonly version: number;
    readonly name: string;
    readonly priceText: string;
    readonly active: boolean;
  };
}) {
  const [state, action] = useServerAction(updateModifierAction);
  return (
    <li className="border-b border-borda py-4">
      <ActionForm
        key={modifier.version}
        action={action}
        state={state}
        aria-label={`Opção ${modifier.name}`}
        className="grid gap-4 md:grid-cols-[2fr_1fr_auto_auto] md:items-end"
      >
        <div className="md:col-span-4">
          <FormMessage state={state} />
        </div>
        <input type="hidden" name="modifierId" value={modifier.id} />
        <input type="hidden" name="version" value={modifier.version} />
        <TextField label="Nome" name="name" defaultValue={modifier.name} required />
        <TextField
          label="Preço extra (R$)"
          name="price"
          inputMode="decimal"
          defaultValue={modifier.priceText}
        />
        <CheckboxField label="Ativa" name="active" defaultChecked={modifier.active} />
        <SubmitButton pendingText="Salvando…" variant="secondary">
          Salvar
        </SubmitButton>
      </ActionForm>
    </li>
  );
}
