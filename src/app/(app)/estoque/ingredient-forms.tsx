'use client';

import {
  addConversionAction,
  countAction,
  createIngredientAction,
  entryAction,
  exitAction,
  lossAction,
  removeConversionAction,
  setMinimumAction,
  updateIngredientAction,
} from '@/modules/inventory/interface/actions';
import { ActionForm } from '@/ui/action-form';
import { CheckboxField, SelectField, TextField } from '@/ui/field';
import { FormMessage } from '@/ui/form-message';
import { SubmitButton } from '@/ui/submit-button';
import { useServerAction } from '@/ui/use-server-action';

export interface UnitOption {
  readonly value: string;
  readonly label: string;
}

/** Cadastro de insumo (RN-INV-02): a unidade base não muda depois. */
export function NewIngredientForm({
  storeId,
  units,
}: {
  readonly storeId: string;
  readonly units: readonly UnitOption[];
}) {
  const [state, action] = useServerAction(createIngredientAction);
  return (
    <ActionForm action={action} state={state}>
      <FormMessage state={state} />
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <TextField
        label="Nome"
        name="name"
        hint="Ex.: Carne moída, Pão de hambúrguer, Refrigerante lata"
        required
        errors={state?.fieldErrors?.name}
      />
      <SelectField
        label="Unidade de controle"
        name="baseUnit"
        options={units}
        hint="Compras em kg viram gramas; em litros, mililitros. Não muda depois do cadastro."
      />
      <SubmitButton pendingText="Salvando…" variant="secondary">
        Cadastrar insumo
      </SubmitButton>
    </ActionForm>
  );
}

interface Target {
  readonly ingredientId: string;
  readonly storeId: string;
  /** Unidades aceitas no lançamento (fixas + conversões do insumo). */
  readonly units: readonly UnitOption[];
}

function AmountFields({
  target,
  label,
  errors,
}: {
  readonly target: Target;
  readonly label: string;
  readonly errors?: Readonly<Record<string, readonly string[]>> | undefined;
}) {
  return (
    <>
      <input type="hidden" name="ingredientId" value={target.ingredientId} />
      <input type="hidden" name="expectedStoreId" value={target.storeId} />
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <TextField
          label={label}
          name="quantity"
          inputMode="decimal"
          hint="Use vírgula para decimais: 1,5"
          required
          errors={errors?.quantity}
        />
        <SelectField label="Unidade" name="unit" options={target.units} className="min-w-24" />
      </div>
    </>
  );
}

/** Entrada (compra): quantidade + valor total pago (E5-2). */
export function EntryForm({ target }: { readonly target: Target }) {
  const [state, action] = useServerAction(entryAction);
  return (
    <ActionForm action={action} state={state} resetOnSuccess>
      <FormMessage state={state} />
      <AmountFields target={target} label="Quantidade comprada" errors={state?.fieldErrors} />
      <TextField
        label="Valor total pago (R$)"
        name="paid"
        inputMode="decimal"
        hint="O que está na nota. Ex.: 88,00"
        required
      />
      <TextField label="Observação (opcional)" name="note" hint="Ex.: fornecedor, nota fiscal" />
      <SubmitButton pendingText="Lançando…">Lançar entrada</SubmitButton>
    </ActionForm>
  );
}

/** Saída manual (uso interno): motivo obrigatório (RN-INV-06). */
export function ExitForm({ target }: { readonly target: Target }) {
  const [state, action] = useServerAction(exitAction);
  return (
    <ActionForm action={action} state={state} resetOnSuccess>
      <FormMessage state={state} />
      <AmountFields target={target} label="Quantidade que saiu" errors={state?.fieldErrors} />
      <TextField label="Motivo" name="note" hint="Ex.: refeição da equipe" required />
      <SubmitButton pendingText="Lançando…">Lançar saída</SubmitButton>
    </ActionForm>
  );
}

/** Perda: motivo da lista; "outro" exige explicação (E5-4). */
export function LossForm({
  target,
  reasons,
}: {
  readonly target: Target;
  readonly reasons: readonly UnitOption[];
}) {
  const [state, action] = useServerAction(lossAction);
  return (
    <ActionForm action={action} state={state} resetOnSuccess>
      <FormMessage state={state} />
      <AmountFields target={target} label="Quantidade perdida" errors={state?.fieldErrors} />
      <SelectField label="Motivo" name="reason" options={reasons} />
      <TextField label="Observação" name="note" hint="Obrigatória quando o motivo é “Outro”." />
      <SubmitButton pendingText="Lançando…" variant="danger">
        Lançar perda
      </SubmitButton>
    </ActionForm>
  );
}

/** Contagem física: informa o que CONTOU; o sistema lança a diferença (RN-INV-08). */
export function CountForm({ target }: { readonly target: Target }) {
  const [state, action] = useServerAction(countAction);
  return (
    <ActionForm action={action} state={state} resetOnSuccess>
      <FormMessage state={state} />
      <AmountFields target={target} label="Quantidade contada" errors={state?.fieldErrors} />
      <SubmitButton pendingText="Salvando…">Registrar contagem</SubmitButton>
    </ActionForm>
  );
}

/** Estoque mínimo na loja (RN-INV-11), na unidade base. */
export function MinimumForm({
  ingredientId,
  storeId,
  value,
  unitLabel,
}: {
  readonly ingredientId: string;
  readonly storeId: string;
  readonly value: string;
  readonly unitLabel: string;
}) {
  const [state, action] = useServerAction(setMinimumAction);
  return (
    <ActionForm key={value} action={action} state={state}>
      <FormMessage state={state} />
      <input type="hidden" name="ingredientId" value={ingredientId} />
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <TextField
        label={`Estoque mínimo (${unitLabel})`}
        name="minimum"
        inputMode="decimal"
        defaultValue={value}
        hint="Quando o saldo chegar a este valor, o insumo aparece no alerta. 0 = sem alerta."
      />
      <SubmitButton pendingText="Salvando…" variant="secondary">
        Salvar mínimo
      </SubmitButton>
    </ActionForm>
  );
}

/** Nome e situação do insumo. */
export function IngredientDataForm({
  ingredient,
}: {
  readonly ingredient: {
    readonly id: string;
    readonly version: number;
    readonly name: string;
    readonly active: boolean;
  };
}) {
  const [state, action] = useServerAction(updateIngredientAction);
  return (
    <ActionForm key={ingredient.version} action={action} state={state}>
      <FormMessage state={state} />
      <input type="hidden" name="ingredientId" value={ingredient.id} />
      <input type="hidden" name="version" value={ingredient.version} />
      <TextField label="Nome" name="name" defaultValue={ingredient.name} required />
      <CheckboxField
        label="Ativo"
        name="active"
        defaultChecked={ingredient.active}
        hint="Desativado não recebe compras nem entra em fichas novas; o histórico fica."
      />
      <SubmitButton pendingText="Salvando…">Salvar insumo</SubmitButton>
    </ActionForm>
  );
}

/** Unidades de compra do insumo ("caixa" = 12 un) — RN-INV-03. */
export function ConversionForms({
  ingredientId,
  baseLabel,
  conversions,
}: {
  readonly ingredientId: string;
  readonly baseLabel: string;
  readonly conversions: readonly { id: string; unitName: string; factor: string }[];
}) {
  const [state, add] = useServerAction(addConversionAction);
  const [removeState, remove] = useServerAction(removeConversionAction);
  return (
    <div className="flex flex-col gap-4">
      <FormMessage state={removeState} />
      {conversions.length === 0 ? (
        <p className="text-tinta-suave">Só as unidades padrão.</p>
      ) : (
        <ul className="flex flex-col border-t border-borda">
          {conversions.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-borda py-3"
            >
              <span>
                1 {item.unitName} = {item.factor} {baseLabel}
              </span>
              <form action={remove}>
                <input type="hidden" name="conversionId" value={item.id} />
                <SubmitButton
                  pendingText="Excluindo…"
                  variant="quiet"
                  aria-label={`Excluir a unidade ${item.unitName}`}
                >
                  Excluir
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={add} state={state} resetOnSuccess>
        <FormMessage state={state} />
        <input type="hidden" name="ingredientId" value={ingredientId} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Nova unidade" name="unitName" hint="Ex.: caixa, fardo" required />
          <TextField
            label={`Quanto vale (${baseLabel})`}
            name="factor"
            inputMode="decimal"
            hint="Ex.: 12"
            required
          />
        </div>
        <SubmitButton pendingText="Salvando…" variant="secondary">
          Incluir unidade
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
